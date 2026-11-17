/**
 * Search, Use my location, and the street/pin they fill.
 *
 * Shared by checkout/match (`app/request/where.tsx`), Saved Places and the
 * delivery-pin change so the editors cannot drift. The pin is the source of
 * truth: every tap or drag reverse-geocodes and replaces the street the map
 * filled in (a street the client typed is kept unless the map names a new
 * one); landmark fills only when empty. Last placement wins. Permission is
 * requested only on the tap — a quiet pre-pin runs solely when the phone has
 * already granted location and the map is still empty.
 */

import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";

import { ADDRESS_LABEL_MAX, checkAddress, composeAddress } from "@/lib/address";
import { peekCurrentLocation, requestCurrentLocation } from "@/lib/deviceLocation";
import { pinStatus } from "@/lib/dropoffPin";
import {
  SEARCH_DEBOUNCE_MS,
  pointInDavao,
  reverseNominatim,
  searchNominatim,
  type DropoffSuggestion,
  type PinPrecision,
} from "@/lib/geocode";
import type { GeoPoint } from "@/lib/tracking";

function appVersion(): string {
  return Constants.expoConfig?.version ?? "1.0.0";
}

export function useDropoffEditor(options?: {
  initialLabel?: string;
  /** Skip the quiet pre-pin (an existing saved row already has a point). */
  skipPrePin?: boolean;
}) {
  const [label, setLabel] = useState(options?.initialLabel ?? "");
  const [line1, setLine1State] = useState("");
  const [landmark, setLandmark] = useState("");
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [query, setQuery] = useState("");
  // The last answer, remembered against the words it answered. Results and
  // the searching flag fall out of comparing that to what is typed now.
  const [search, setSearch] = useState<{
    query: string;
    results: DropoffSuggestion[];
    message: string | null;
    /** The lookup itself failed (offline, busy, slow) — worth trying again. */
    failed: boolean;
  }>({ query: "", results: [], message: null, failed: false });
  // Bumped by Retry / the keyboard's Search key to ask the same words again.
  const [searchAttempt, setSearchAttempt] = useState(0);
  const retrying = useRef(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [completeAddress, setCompleteAddress] = useState("");
  const [reversing, setReversing] = useState(false);
  const [streetUnread, setStreetUnread] = useState(false);
  // How sure the pin is: the phone's radius after Use my location, or what
  // kind of place a search hit was. Both clear once the client places the
  // pin by hand — then it is exactly where they said.
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [precision, setPrecision] = useState<PinPrecision | null>(null);
  const [placeName, setPlaceName] = useState("");
  // What the reverse lookup said about this exact point: in Davao City or
  // not. The city box is a rectangle, so a town at its edge is only known to
  // be outside once OSM names it. Kept per point, cleared by a new point.
  const [cityVerdict, setCityVerdict] = useState<{ point: GeoPoint; outside: boolean } | null>(null);

  const pointRef = useRef(point);
  const lineRef = useRef(line1);
  useEffect(() => {
    pointRef.current = point;
    lineRef.current = line1;
  });
  // True while the street line is the map's words rather than the client's.
  // A pin moved somewhere the map cannot name must not keep the old street.
  const lineFromMap = useRef(false);
  const prePinned = useRef(false);
  const searchGen = useRef(0);
  const reverseGen = useRef(0);
  // Who owns the "Finding you…" state. A pin placed while the phone is still
  // acquiring takes it over, so the late GPS answer neither moves the pin nor
  // leaves the button disabled for good (#432 review, C1).
  const locateGen = useRef(0);

  const trimmedQuery = query.trim();
  const answered = search.query === trimmedQuery;
  const results = answered ? search.results : [];
  const searching = trimmedQuery !== "" && !answered;
  const searchNotice = answered && trimmedQuery ? search.message : null;
  const searchFailed = answered && Boolean(trimmedQuery) && search.failed;

  const verdictHere =
    cityVerdict && point && cityVerdict.point.lat === point.lat && cityVerdict.point.lng === point.lng
      ? cityVerdict
      : null;
  const outside = Boolean(point) && (!pointInDavao(point as GeoPoint) || Boolean(verdictHere?.outside));
  const parts = { line1, barangay: "", landmark };
  const addressCheck = checkAddress(parts);
  const addressLine = composeAddress(parts);
  // Not while the pin is still being read: the street on screen may belong to
  // the previous spot, and the city verdict is not in yet.
  const ready = addressCheck.ok && Boolean(point) && !outside && !reversing && !locating;
  const saveLabel = (label.trim() || addressLine).slice(0, ADDRESS_LABEL_MAX);

  const setLine1 = useCallback((value: string) => {
    lineFromMap.current = false;
    setLine1State(value);
  }, []);

  const fillFromMap = useCallback((suggestion: DropoffSuggestion) => {
    lineFromMap.current = true;
    setLine1State(suggestion.line1);
    setCompleteAddress(suggestion.completeAddress ?? "");
    setStreetUnread(!suggestion.line1);
    if (suggestion.landmark) setLandmark((current) => current || suggestion.landmark);
  }, []);

  /** The map could not name this spot: forget a street it named for another. */
  const forgetMapStreet = useCallback(() => {
    setCompleteAddress("");
    setStreetUnread(true);
    if (lineFromMap.current) {
      lineFromMap.current = false;
      setLine1State("");
    }
  }, []);

  /** A placement by hand or search takes over from a GPS fix still on its way. */
  const stopLocating = useCallback(() => {
    locateGen.current += 1;
    setLocating(false);
  }, []);

  const pickSearch = useCallback(
    (suggestion: DropoffSuggestion) => {
      stopLocating();
      reverseGen.current += 1;
      setReversing(false);
      // Search results are already checked against the city by name.
      setCityVerdict({ point: suggestion.point, outside: false });
      setPoint(suggestion.point);
      fillFromMap(suggestion);
      setAccuracyMeters(null);
      setPrecision(suggestion.precision ?? "exact");
      setPlaceName(suggestion.label);
      if (!options?.initialLabel && suggestion.label && suggestion.precision !== "area") {
        setLabel((current) => current || suggestion.label.slice(0, ADDRESS_LABEL_MAX));
      }
      setQuery("");
      setSearch({ query: "", results: [], message: null, failed: false });
      setNotice(null);
    },
    [fillFromMap, stopLocating, options?.initialLabel],
  );

  const runReverse = useCallback(
    async (next: GeoPoint) => {
      const gen = ++reverseGen.current;
      const isCurrent = () => gen === reverseGen.current;
      setReversing(true);
      setStreetUnread(false);
      setNotice(null);
      try {
        const result = await reverseNominatim(next, appVersion(), undefined, { isCurrent });
        if (!isCurrent() || result.status === "superseded") return;
        if (result.status === "ok" || result.status === "empty" || result.status === "outside_davao") {
          setCityVerdict({ point: next, outside: result.status === "outside_davao" });
        }
        if (result.status === "ok") {
          // The pin is the source of truth: a later placement replaces the
          // street even when the field had text from search or an earlier pin.
          fillFromMap(result.suggestion);
          return;
        }
        forgetMapStreet();
        // Outside Davao is drawn on the pin row from the verdict above.
        if (result.status === "failed") setNotice(result.message);
      } finally {
        if (isCurrent()) setReversing(false);
      }
    },
    [fillFromMap, forgetMapStreet],
  );

  /** A tap or a drag: the client put the pin exactly here. */
  const pickPin = useCallback(
    (next: GeoPoint) => {
      stopLocating();
      setPoint(next);
      setAccuracyMeters(null);
      setPrecision(null);
      setPlaceName("");
      void runReverse(next);
    },
    [runReverse, stopLocating],
  );

  const useMyLocation = useCallback(async () => {
    if (locating) return;
    const gen = ++locateGen.current;
    const mine = () => gen === locateGen.current;
    setLocating(true);
    setNotice(null);
    try {
      const result = await requestCurrentLocation();
      if (!mine()) return;
      if (result.status !== "ok") {
        setNotice(result.message);
        return;
      }
      if (!pointInDavao(result.point)) {
        // Not a pin: the phone is somewhere GRIDGO does not deliver.
        setNotice("This phone is outside Davao City. Search for the drop-off, or tap the map.");
        return;
      }
      setPoint(result.point);
      setAccuracyMeters(result.accuracyMeters ?? null);
      setPrecision(null);
      setPlaceName("");
      setLocating(false);
      // From here it is an ordinary placement: the reverse lookup owns it.
      void runReverse(result.point);
    } finally {
      if (mine()) setLocating(false);
    }
  }, [locating, runReverse]);

  const onChangeQuery = useCallback((value: string) => {
    setQuery(value);
    setNotice(null);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const gen = ++searchGen.current;
    const isCurrent = () => gen === searchGen.current;
    // A retry has already waited for its tap; a keystroke waits to settle.
    const now = retrying.current;
    retrying.current = false;
    const handle = setTimeout(
      () => {
        void searchNominatim(q, appVersion(), undefined, { isCurrent }).then((result) => {
          if (!isCurrent() || result.status === "superseded") return;
          if (result.status === "ok") {
            setSearch({ query: q, results: result.suggestions, message: null, failed: false });
            return;
          }
          setSearch({ query: q, results: [], message: result.message, failed: result.status === "failed" });
        });
      },
      now ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [query, searchAttempt]);

  /**
   * Ask the same words again — Retry, or the keyboard's Search key. Goes
   * through the same queue, so it still keeps to Nominatim's one a second.
   */
  const retrySearch = useCallback(() => {
    if (!query.trim()) return;
    retrying.current = true;
    setSearch({ query: "", results: [], message: null, failed: false });
    setSearchAttempt((attempt) => attempt + 1);
  }, [query]);

  useEffect(() => {
    if (options?.skipPrePin || prePinned.current) return;
    prePinned.current = true;
    void peekCurrentLocation().then(async (result) => {
      if (!result || result.status !== "ok") return;
      if (pointRef.current || !pointInDavao(result.point)) return;
      const reverse = await reverseNominatim(result.point, appVersion());
      if (pointRef.current) return;
      setPoint(result.point);
      setAccuracyMeters(result.accuracyMeters ?? null);
      if (reverse.status !== "failed" && reverse.status !== "superseded") {
        setCityVerdict({ point: result.point, outside: reverse.status === "outside_davao" });
      }
      if (reverse.status === "ok" && !lineRef.current.trim()) fillFromMap(reverse.suggestion);
    });
  }, [options?.skipPrePin, fillFromMap]);

  const loadSaved = useCallback(
    (input: { label: string; line1: string; landmark: string; point: GeoPoint }) => {
      locateGen.current += 1;
      setLocating(false);
      setCityVerdict(null);
      reverseGen.current += 1;
      setReversing(false);
      setLabel(input.label);
      lineFromMap.current = false;
      setLine1State(input.line1);
      setLandmark(input.landmark);
      setPoint(input.point);
      setCompleteAddress("");
      setStreetUnread(false);
      setAccuracyMeters(null);
      setPrecision(null);
      setPlaceName("");
      prePinned.current = true;
    },
    [],
  );

  const pin = pinStatus({
    hasPoint: Boolean(point),
    locating,
    reversing,
    outside,
    streetUnread,
    line1,
    landmark,
    completeAddress,
    accuracyMeters,
    precision,
    placeName,
  });

  return {
    label,
    setLabel,
    line1,
    setLine1,
    landmark,
    setLandmark,
    point,
    setPoint,
    query,
    onChangeQuery,
    results,
    searching,
    /** Why the search list is empty: no match, outside Davao, offline, busy. */
    searchNotice,
    /** The last lookup failed rather than finding nothing: offer Retry. */
    searchFailed,
    retrySearch,
    locating,
    notice,
    setNotice,
    touched,
    setTouched,
    parts,
    addressCheck,
    addressLine,
    ready,
    outside,
    saveLabel,
    pickSearch,
    pickPin,
    useMyLocation,
    runReverse,
    loadSaved,
    completeAddress,
    reversing,
    accuracyMeters,
    /** The row under the map: what GRIDGO will send the rider to. */
    pin,
  };
}
