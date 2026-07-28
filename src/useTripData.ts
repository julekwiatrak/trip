import { useCallback, useEffect, useState } from "react";
import { loadTripData, type TripData } from "./tripData";

export function useTripData() {
  const [data, setData] = useState<TripData>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await loadTripData());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The trip could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadTripData()
      .then((result) => { if (active) setData(result); })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "The trip could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { data, error, loading, reload };
}
