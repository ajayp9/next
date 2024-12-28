const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Sample data for stops
const stops = [
  { id: 1, name: "Stop A", location: { lat: 12.9716, lon: 77.5946 }, demand: { weekday: 50, weekend: 80 }, supply: 5 },
  { id: 2, name: "Stop B", location: { lat: 12.9352, lon: 77.6245 }, demand: { weekday: 70, weekend: 100 }, supply: 2 },
  { id: 3, name: "Stop C", location: { lat: 12.9141, lon: 77.6109 }, demand: { weekday: 60, weekend: 90 }, supply: 4 },
  { id: 4, name: "Stop D", location: { lat: 12.9784, lon: 77.6408 }, demand: { weekday: 80, weekend: 110 }, supply: 3 },
  { id: 5, name: "Stop E", location: { lat: 12.9857, lon: 77.6058 }, demand: { weekday: 55, weekend: 75 }, supply: 6 },
  { id: 6, name: "Stop F", location: { lat: 12.9304, lon: 77.6783 }, demand: { weekday: 65, weekend: 95 }, supply: 1 },
  { id: 7, name: "Stop G", location: { lat: 12.9250, lon: 77.5897 }, demand: { weekday: 40, weekend: 60 }, supply: 7 },
  { id: 8, name: "Stop H", location: { lat: 12.9279, lon: 77.6271 }, demand: { weekday: 75, weekend: 120 }, supply: 2 },
  { id: 9, name: "Stop I", location: { lat: 12.9568, lon: 77.7011 }, demand: { weekday: 90, weekend: 130 }, supply: 4 },
  { id: 10, name: "Stop J", location: { lat: 12.9165, lon: 77.6001 }, demand: { weekday: 45, weekend: 70 }, supply: 5 }
];

// Utility function to calculate the Haversine distance
function haversineDistance(coord1, coord2) {
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const R = 6371e3; // Earth's radius in meters
  const φ1 = toRadians(coord1.lat);
  const φ2 = toRadians(coord2.lat);
  const Δφ = toRadians(coord2.lat - coord1.lat);
  const Δλ = toRadians(coord2.lon - coord1.lon);

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Normalize values between 0 and 1
function normalize(value, min, max) {
  return max === min ? 1 : (value - min) / (max - min);
}

// Calculate demand based on time
function calculateDemand(stop, isWeekend, hour) {
  const baseDemand = isWeekend ? stop.demand.weekend : stop.demand.weekday;
  const peakMultiplier = hour >= 8 && hour <= 10 || hour >= 17 && hour <= 20 ? 1.5 : 1;
  return baseDemand * peakMultiplier;
}

// Precompute stats for normalization
function computeStats(driverLocation, isWeekend, hour) {
  let minDemand = Infinity, maxDemand = -Infinity;
  let minInverseSupply = Infinity, maxInverseSupply = -Infinity;
  let minInverseDistance = Infinity, maxInverseDistance = -Infinity;

  stops.forEach(stop => {
    const demand = calculateDemand(stop, isWeekend, hour);
    const distance = haversineDistance(driverLocation, stop.location);
    const inverseSupply = 1 / (stop.supply + 1);

    minDemand = Math.min(minDemand, demand);
    maxDemand = Math.max(maxDemand, demand);
    minInverseSupply = Math.min(minInverseSupply, inverseSupply);
    maxInverseSupply = Math.max(maxInverseSupply, inverseSupply);
    minInverseDistance = Math.min(minInverseDistance, 1 / (distance + 1));
    maxInverseDistance = Math.max(maxInverseDistance, 1 / (distance + 1));
  });

  return { minDemand, maxDemand, minInverseSupply, maxInverseSupply, minInverseDistance, maxInverseDistance };
}

// Calculate the score for each stop
function calculateScore(stop, driverLocation, isWeekend, hour, stats) {
  const demand = calculateDemand(stop, isWeekend, hour);
  const distance = haversineDistance(driverLocation, stop.location);
  const inverseSupply = 1 / (stop.supply + 1);

  const normalizedDemand = normalize(demand, stats.minDemand, stats.maxDemand);
  const normalizedSupply = normalize(inverseSupply, stats.minInverseSupply, stats.maxInverseSupply);
  const normalizedDistance = normalize(1 / (distance + 1), stats.minInverseDistance, stats.maxInverseDistance);

  return normalizedDemand + normalizedSupply + normalizedDistance;
}

// Get the next best stop based on the current location, time, and other factors
// app.post('/next-stop', (req, res) => {
//   const { currentLocation, currentTime } = req.body;
//   const date = new Date(currentTime);
//   const isWeekend = [0, 6].includes(date.getDay()); // 0 = Sunday, 6 = Saturday
//   const hour = date.getHours();

//   const stats = computeStats(currentLocation, isWeekend, hour);
//   let bestStop = null;
//   let bestScore = -Infinity;

//   stops.forEach(stop => {
//     const score = calculateScore(stop, currentLocation, isWeekend, hour, stats);
//     if (score > bestScore) {
//       bestStop = stop;
//       bestScore = score;
//     }
//   });

//   if (bestStop) {
//     res.json({ nextStop: bestStop });
//   } else {
//     res.status(404).json({ error: 'No suitable stop found.' });
//   }
// });

// // Set the port for the server
// const port = process.env.PORT || 3000;
// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });

app.post('/next-stop', (req, res) => {
  const { currentLocation, currentTime } = req.body;

  // console.log('Received input:', req.body); // Check the received data

  if (!currentLocation || !currentLocation.latitude || !currentLocation.longitude) {
      return res.status(400).json({ error: "Invalid location. Provide latitude and longitude." });
  }

  if (!currentTime || isNaN(Date.parse(currentTime))) {
      return res.status(400).json({ error: "Invalid time. Provide a valid timestamp." });
  }

  const driverLocation = { lat: currentLocation.latitude, lon: currentLocation.longitude };
  const date = new Date(currentTime);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Sunday or Saturday
  const hour = date.getHours();

  // console.log('Driver Location:', driverLocation);
  // console.log('Is Weekend:', isWeekend);
  // console.log('Hour:', hour);

  const stats = computeStats(driverLocation, isWeekend, hour);
  let bestStop = null;
  let highestScore = -Infinity;

  stops.forEach(stop => {
      const score = calculateScore(stop, driverLocation, isWeekend, hour, stats);
      // console.log(`Stop: ${stop.name}, Score: ${score}`);

      if (score > highestScore) {
          highestScore = score;
          bestStop = stop;
      }
  });

  if (bestStop) {
      res.json({
          nextStop: {
              id: bestStop.id,
              name: bestStop.name,
              location: {
                  latitude: bestStop.location.lat,
                  longitude: bestStop.location.lon
              }
          }
      });
  } else {
      // console.log('No suitable stop found.');
      res.status(404).json({ error: "No suitable stop found." });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
