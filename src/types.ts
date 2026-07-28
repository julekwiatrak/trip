export type City = {
  id: string;
  name: string;
  countryCode: string;
  timeZone: string;
};

export type EventType =
  | "travel"
  | "hotel-stay"
  | "food-drink"
  | "other-activity";

export type TransportMode = "train" | "flight" | "bus" | "taxi" | "other";

type BaseEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  details?: string;
};

export type LocatedEvent = BaseEvent & {
  type: Exclude<EventType, "travel">;
  cityId: string;
};

export type TravelEvent = BaseEvent & {
  type: "travel";
  endsAt: string;
  originCityId: string;
  destinationCityId: string;
  transport: TransportMode;
};

export type ItineraryEvent = LocatedEvent | TravelEvent;

export type TimelineGroup = "earlier" | "now" | "next" | "later";
