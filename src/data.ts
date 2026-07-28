import type { City, ItineraryEvent } from "./types";

export const cities: City[] = [
  { id: "warsaw", name: "Warsaw", countryCode: "PL", timeZone: "Europe/Warsaw" },
  { id: "berlin", name: "Berlin", countryCode: "DE", timeZone: "Europe/Berlin" },
];

// Relative demo dates keep the live timeline useful until real trip data is connected.
const at = (dayOffset: number, hour: number, minute = 0) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
};

export const itinerary: ItineraryEvent[] = [
  {
    id: "arrive-warsaw",
    type: "arrival",
    title: "Arrival in Warsaw",
    startsAt: at(-1, 14, 20),
    cityId: "warsaw",
    details: "Follow signs through baggage reclaim and arrivals.",
  },
  {
    id: "warsaw-hotel",
    type: "stay",
    title: "Royal Tulip Warsaw",
    startsAt: at(-1, 15),
    endsAt: at(1, 8),
    cityId: "warsaw",
    details:
      "Exit arrivals through the nearest door and order an Uber or Bolt to the hotel. Go to the dedicated rank and show the ride in your app to the first available driver.",
  },
  {
    id: "warsaw-drinks",
    type: "food-drink",
    title: "Drinks near the Old Town",
    startsAt: at(0, 19),
    endsAt: at(0, 21),
    cityId: "warsaw",
    details: "Meet in the hotel lobby fifteen minutes before departure.",
  },
  {
    id: "train-berlin",
    type: "travel",
    title: "Train to Berlin",
    startsAt: at(1, 9, 2),
    endsAt: at(1, 14, 6),
    originCityId: "warsaw",
    destinationCityId: "berlin",
    transport: "train",
    details: "Be on the platform at least fifteen minutes before departure.",
  },
  {
    id: "arrive-berlin",
    type: "arrival",
    title: "Arrival in Berlin",
    startsAt: at(1, 14, 6),
    cityId: "berlin",
  },
  {
    id: "berlin-hotel",
    type: "stay",
    title: "Hotel check-in",
    startsAt: at(1, 15),
    endsAt: at(3, 10),
    cityId: "berlin",
    details: "The booking is under the lead traveller's surname.",
  },
  {
    id: "museum",
    type: "activity",
    title: "Museum Island",
    startsAt: at(2, 11),
    endsAt: at(2, 14),
    cityId: "berlin",
  },
];
