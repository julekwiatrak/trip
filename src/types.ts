export type City = {
  id: string;
  name: string;
  countryCode: string;
  timeZone: string;
};

export type EventType =
  | "travel"
  | "arrival"
  | "stay"
  | "food-drink"
  | "activity"
  | "note";

type BaseEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  details?: string;
};

export type LocatedEvent = BaseEvent & {
  type: Exclude<EventType, "travel" | "arrival">;
  cityId: string;
};

export type ArrivalEvent = BaseEvent & {
  type: "arrival";
  cityId: string;
};

export type TravelEvent = BaseEvent & {
  type: "travel";
  endsAt: string;
  originCityId: string;
  destinationCityId: string;
  transport: "train" | "flight" | "bus" | "car" | "walk";
};

export type ItineraryEvent = LocatedEvent | ArrivalEvent | TravelEvent;

export type TimelineGroup = "earlier" | "now" | "next" | "later";
