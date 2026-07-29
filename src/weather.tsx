/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from "react";
import type { City } from "./types";

type WeatherPoint = { temperature: number; code: number };
type CityWeather = { current: WeatherPoint; hourlyTimes: number[]; hourlyTemperatures: number[]; hourlyCodes: number[] };
type WeatherCache = { fetchedAt: number; cityKey: string; byCity: Record<string, CityWeather> };

const CACHE_KEY = "trip-weather-v1";
const CACHE_AGE = 45 * 60 * 1000;

function cityKey(cities: City[]) {
  return cities.filter((city) => city.latitude !== null).map((city) => `${city.id}:${city.latitude}:${city.longitude}`).join("|");
}

function cachedWeather(key: string): WeatherCache | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as WeatherCache | null;
    return parsed && parsed.cityKey === key && Date.now() - parsed.fetchedAt < CACHE_AGE ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function fetchWeather(cities: City[]): Promise<WeatherCache> {
  const located = cities.filter((city): city is City & { latitude: number; longitude: number } => city.latitude !== null && city.longitude !== null);
  const key = cityKey(cities);
  if (!located.length) return { fetchedAt: Date.now(), cityKey: key, byCity: {} };
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: located.map((city) => city.latitude).join(","),
    longitude: located.map((city) => city.longitude).join(","),
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,weather_code",
    forecast_days: "16",
    past_days: "1",
    timezone: "GMT",
  }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error("Weather is temporarily unavailable.");
  const json = await response.json();
  const results = Array.isArray(json) ? json : [json];
  const byCity: Record<string, CityWeather> = {};
  located.forEach((city, index) => {
    const result = results[index];
    if (!result?.current || !result?.hourly) return;
    byCity[city.id] = {
      current: { temperature: result.current.temperature_2m, code: result.current.weather_code },
      hourlyTimes: result.hourly.time.map((time: string) => new Date(`${time}Z`).getTime()),
      hourlyTemperatures: result.hourly.temperature_2m,
      hourlyCodes: result.hourly.weather_code,
    };
  });
  const cache = { fetchedAt: Date.now(), cityKey: key, byCity };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* Cache is optional. */ }
  return cache;
}

export function useWeather(cities: City[]) {
  const key = useMemo(() => cityKey(cities), [cities]);
  const [cache, setCache] = useState<WeatherCache | undefined>(() => cachedWeather(key));
  useEffect(() => {
    let active = true;
    const existing = cachedWeather(key);
    if (existing) {
      Promise.resolve(existing).then((value) => { if (active) setCache(value); });
    } else {
      void fetchWeather(cities).then((value) => { if (active) setCache(value); }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [cities, key]);

  return {
    current(cityId: string | undefined) {
      return cityId ? cache?.byCity[cityId]?.current : undefined;
    },
    at(cityId: string | undefined, instant: string) {
      const weather = cityId ? cache?.byCity[cityId] : undefined;
      if (!weather) return undefined;
      const target = new Date(instant).getTime();
      let nearest = -1;
      let difference = Number.POSITIVE_INFINITY;
      weather.hourlyTimes.forEach((time, index) => {
        const candidate = Math.abs(time - target);
        if (candidate < difference) { difference = candidate; nearest = index; }
      });
      return nearest >= 0 && difference <= 90 * 60 * 1000
        ? { temperature: weather.hourlyTemperatures[nearest], code: weather.hourlyCodes[nearest] }
        : undefined;
    },
  };
}

function WeatherGlyph({ code }: { code: number }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (code === 0) return <svg {...common}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg>;
  if ([1, 2, 3, 45, 48].includes(code)) return <svg {...common}><path d="M7 17h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.5 1.5A3.3 3.3 0 0 0 7 17Z"/><path d="M6 6 4.5 4.5M10 3v2"/></svg>;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <svg {...common}><path d="M7 14h10a3.5 3.5 0 0 0 .2-7A5 5 0 0 0 8 8.5 3 3 0 0 0 7 14Z"/><path d="m8 18 .01 0m4 2 .01 0m4-2 .01 0"/></svg>;
  if ([95, 96, 99].includes(code)) return <svg {...common}><path d="M7 13h10a3.5 3.5 0 0 0 .2-7A5 5 0 0 0 8 7.5 3 3 0 0 0 7 13Z"/><path d="m13 14-3 5h3l-2 3"/></svg>;
  return <svg {...common}><path d="M7 13h10a3.5 3.5 0 0 0 .2-7A5 5 0 0 0 8 7.5 3 3 0 0 0 7 13Z"/><path d="m8 17-1 2m5-2-1 2m5-2-1 2"/></svg>;
}

export function WeatherBadge({ weather }: { weather: WeatherPoint | undefined }) {
  if (!weather) return null;
  return <span className="weather-badge" title={`Weather forecast: ${Math.round(weather.temperature)}°C`}><WeatherGlyph code={weather.code}/><b>{Math.round(weather.temperature)}°</b></span>;
}
