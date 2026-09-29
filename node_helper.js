const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const Log = require("logger");

module.exports = NodeHelper.create({
    start: function () {
        Log.log("MMM-GoogleMapsTraffic node helper started");
    },

    socketNotificationReceived: function (notification, payload) {
        Log.log("Node helper received notification:", notification);
        if (notification === "MMM-GOOGLE_MAPS-TRAFFIC-GET" || notification === "MMM-GOOGLE_MAPS_TRAFFIC-GET") {
            Log.log("Processing style:", payload.style);
            const stylePayload = this.getStyleMap(payload.style);
            this.sendSocketNotification("MMM-GOOGLE_MAPS_TRAFFIC-RESPONSE", stylePayload);
        } else if (notification === "MMM-GOOGLE_MAPS_TRAFFIC-TRAVEL-GET") {
            this.getTravelTimes(payload).then((travelTimes) => {
                this.sendSocketNotification("MMM-GOOGLE_MAPS_TRAFFIC-TRAVEL-RESPONSE", travelTimes);
            });
        }
    },

    // Fetches driving time (with and without traffic) from origin to each destination via the Routes API
    getTravelTimes: function ({ key, origin, destinations }) {
        return Promise.all(destinations.map(async (destination) => {
            try {
                const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": key,
                        "X-Goog-FieldMask": "routes.duration,routes.staticDuration"
                    },
                    body: JSON.stringify({
                        origin: { address: origin },
                        destination: { address: destination.address },
                        travelMode: "DRIVE",
                        routingPreference: "TRAFFIC_AWARE"
                    })
                });
                const data = await response.json();
                if (!response.ok || !data.routes || data.routes.length === 0) {
                    throw new Error(data.error ? data.error.message : "No route found");
                }
                const route = data.routes[0];
                return {
                    name: destination.name,
                    duration: parseInt(route.duration, 10),
                    staticDuration: parseInt(route.staticDuration, 10)
                };
            } catch (err) {
                Log.error(`MMM-GoogleMapsTraffic: travel time for ${destination.name} failed:`, err.message);
                return { name: destination.name, error: true };
            }
        }));
    },

    getStyleMap: function (style) {
        try {
            const filePath = path.join(__dirname, "mapStyle", `${style}.json`);
            const styledMapType = JSON.parse(fs.readFileSync(filePath, "utf8"));
            Log.log("Style loaded successfully:", style);
            return { styledMapType };
        } catch (err) {
            if (err.code === "ENOENT") {
                Log.log(`Styled map file not found: ${style}`);
            } else {
                Log.error(`Error loading styled map file: ${style}`, err);
            }
            return { styledMapType: [] };
        }
    }
});
