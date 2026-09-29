/* global Module */

/* Magic Mirror
 * Module: MMM-GoogleMapsTraffic
 *
 * By Victor Mora (modified)
 * MIT Licensed.
 */

Module.register("MMM-GoogleMapsTraffic", {
    defaults: {
        key: '',
        lat: '',          // Provide a valid latitude (e.g., 40.7128)
        lng: '',          // Provide a valid longitude (e.g., -74.0060)
        height: '300px',
        width: '300px',
        zoom: 10,
        mapTypeId: 'roadmap',
        styledMapType: 'standard',
        disableDefaultUI: true,
        updateInterval: 900000,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        markers: [],
        routesKey: '',                // Server-side key with Routes API enabled (no referrer restriction)
        origin: '',                   // Start address for travel times
        destinations: [],             // [{ name: 'Asker', address: '...' }]
        travelUpdateInterval: 600000,
        moderateTrafficRatio: 1.15,   // duration / duration without traffic => yellow
        heavyTrafficRatio: 1.35       // => red
    },

    start: function () {
        console.log("MMM-GoogleMapsTraffic starting");
        if (this.config.key === "") {
            Log.error("MMM-GoogleMapsTraffic: key not set!");
            return;
        }

        // Request the styled map JSON from node_helper
        this.sendSocketNotification("MMM-GOOGLE_MAPS_TRAFFIC-GET", { style: this.config.styledMapType });
        console.log("Sent initial notification for style:", this.config.styledMapType);

        this.updateIntervalId = setInterval(() => {
            this.sendSocketNotification("MMM-GOOGLE_MAPS_TRAFFIC-GET", { style: this.config.styledMapType });
            console.log("Sent periodic update notification");
        }, this.config.updateInterval);

        this.travelTimes = [];
        if (this.config.routesKey && this.config.origin && this.config.destinations.length > 0) {
            this.requestTravelTimes();
            this.travelIntervalId = setInterval(() => {
                this.requestTravelTimes();
            }, this.config.travelUpdateInterval);
        }
    },

    requestTravelTimes: function () {
        this.sendSocketNotification("MMM-GOOGLE_MAPS_TRAFFIC-TRAVEL-GET", {
            key: this.config.routesKey,
            origin: this.config.origin,
            destinations: this.config.destinations
        });
    },

    // Updates the travel list in place so the map is not recreated.
    // Looked up in the live DOM because MagicMirror may keep the old element when getDom output is unchanged.
    renderTravelTimes: function (travelList = document.querySelector(`#${this.identifier} .travel-list`)) {
        if (!travelList) {
            return;
        }
        travelList.innerHTML = "";
        this.travelTimes.forEach((travel) => {
            const row = document.createElement("div");
            row.className = "travel-row";

            const name = document.createElement("span");
            name.className = "travel-name";
            name.textContent = travel.name;

            const time = document.createElement("span");
            time.className = "travel-time";
            if (travel.error) {
                time.textContent = "–";
            } else {
                time.textContent = `${Math.round(travel.duration / 60)} min`;
                const ratio = travel.duration / travel.staticDuration;
                if (ratio >= this.config.heavyTrafficRatio) {
                    time.classList.add("traffic-heavy");
                } else if (ratio >= this.config.moderateTrafficRatio) {
                    time.classList.add("traffic-moderate");
                }
            }

            row.appendChild(name);
            row.appendChild(time);
            travelList.appendChild(row);
        });
    },

    getStyles: function () {
        return ["MMM-GoogleMapsTraffic.css"];
    },

    getDom: function () {
    
        // Reset map instance if exists
        if (this.map) {
            console.log("Resetting existing map instance");
            google.maps.event.clearInstanceListeners(this.map);
            this.map = null;
        }
    
    
        const wrapper = document.createElement("div");
        wrapper.style.width = this.config.width;

        const mapDiv = document.createElement("div");
        // Use a fixed id (adjust if you plan on multiple instances)
        mapDiv.setAttribute("id", "map");
        mapDiv.className = "GoogleMap";
        mapDiv.style.height = this.config.height;
        mapDiv.style.width = this.config.width;
        wrapper.appendChild(mapDiv);

        if (this.config.destinations.length > 0) {
            const travelList = document.createElement("div");
            travelList.className = "travel-list";
            wrapper.appendChild(travelList);
            this.renderTravelTimes(travelList);
        }

        // Check if the Google Maps API is already loaded
        if (!document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = `https://maps.googleapis.com/maps/api/js?key=${this.config.key}&callback=initMap&libraries=places&v=weekly&loading=async`;
            script.defer = true;
            script.async = true;

            // Create a global callback that calls our module's initMap
            window.initMap = () => {
	        console.log("Google Maps script loaded, initializing map");
                setTimeout(() => {
                    this.initMap();
                }, 100);
            };

            document.body.appendChild(script);
        } else if (typeof google !== "undefined" && google.maps) {
	    console.log("Google Maps already loaded, initializing map");
            // If the API is already loaded, call initMap directly after a brief delay.
            setTimeout(() => {
                this.initMap();
            }, 100);
        }

        return wrapper;
    },


	initMap: function () {
        console.log("Initializing map...");
        if (!this.config.lat || !this.config.lng) {
            console.error("Invalid latitude or longitude");
            return;
        }

        const mapElement = document.getElementById("map");
        if (!mapElement) {
            console.error("Map element not found");
            return;
        }

        try {
            console.log("Creating new map instance");
            this.map = new google.maps.Map(mapElement, {
                zoom: this.config.zoom,
                mapTypeId: this.config.mapTypeId,
                center: { lat: this.config.lat, lng: this.config.lng },
                styles: this.styledMapType || [],
                disableDefaultUI: this.config.disableDefaultUI,
                backgroundColor: this.config.backgroundColor
            });

            const trafficLayer = new google.maps.TrafficLayer();
            trafficLayer.setMap(this.map);

            if (this.config.markers && Array.isArray(this.config.markers)) {
                this.config.markers.forEach(marker => {
                    new google.maps.Marker({
                        map: this.map,
                        position: { lat: marker.lat, lng: marker.lng },
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 6,
                            fillColor: marker.fillColor || "red",
                            fillOpacity: 1,
                            strokeWeight: 1
                        }
                    });
                });
            }

            google.maps.event.trigger(this.map, 'resize');
            console.log("Map initialized and resize triggered");
        } catch (error) {
            console.error("Error initializing map:", error);
        }
    },

    socketNotificationReceived: function (notification, payload) {
        console.log("Received socket notification:", notification);
        if (notification === "MMM-GOOGLE_MAPS_TRAFFIC-RESPONSE") {
            console.log("Received style response, styledMapType length:", payload.styledMapType.length);
            this.styledMapType = payload.styledMapType;

            if (this.map) {
                console.log("Updating existing map styles");
                this.map.setOptions({ styles: this.styledMapType });

                // Refresh the traffic layer
                if (this.trafficLayer) {
                    console.log("Removing existing traffic layer");
                    this.trafficLayer.setMap(null); // Remove the existing traffic layer
                }

                console.log("Adding new traffic layer");
                this.trafficLayer = new google.maps.TrafficLayer();
                this.trafficLayer.setMap(this.map); // Add a new traffic layer

                google.maps.event.trigger(this.map, 'resize');
            } else {
                console.log("Map not initialized, updating DOM");
                this.updateDom(500);
            }
        } else if (notification === "MMM-GOOGLE_MAPS_TRAFFIC-TRAVEL-RESPONSE") {
            this.travelTimes = payload;
            this.renderTravelTimes();
        }
    }
});
