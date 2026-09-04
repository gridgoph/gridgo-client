/**
 * Search, Use my location, and the street/pin they fill.
 *
 * Shared by checkout/match (`app/request/where.tsx`) and Saved Places so the
 * two editors cannot drift. The pin is the source of truth: every tap
 * reverse-geocodes and replaces street + the complete-address caption;
 * landmark fills only when empty. Last tap wins. Permission is requested
 * only on the tap — a quiet pre-pin runs solely when the phone has already
 * granted location and the map is still empty.
 */

import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";

import { ADDRESS_LABEL_MAX, checkAddress, composeAddress } from "@/lib/address";
import { peekCurrentLocation, requestCurrentLocation } from "@/lib/deviceLocation";
import {
  OUTSIDE_DAVAO,
  READING_PLACE,
  SEARCH_DEBOUNCE_MS,
  STREET_UNREAD,
  reverseNominatim,
  searchNominatim,
  type DropoffSuggestion,
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
  const [line1, setLine1] = useState("");
  const [landmark, setLandmark] = useState("");
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DropoffSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [completeAddress, setCompleteAddress] = useState("");
  const [reversing, setReversing] = useState(false);
  const [streetUnread, setStreetUnread] = useState(false);

  const pointRef = useRef(point);
  pointRef.current = point;
  const lineRef = useRef(line1);
  lineRef.current = line1;
  const prePinned = useRef(false);
  const searchGen = useRef(0);
  const reverseGen = useRef(0);

  const parts = { line1, barangay: "", landmark };
  const addressCheck = checkAddress(parts);
  const addressLine = composeAddress(parts);
  const ready = addressCheck.ok && Boolean(point);
  const saveLabel = (label.trim() || addressLine).slice(0, ADDRESS_LABEL_MAX);

  const applySuggestion = useCallback((suggestion: DropoffSuggestion, fillLabel: boolean) => {
    reverseGen.current += 1;
    setReversing(false);
    setStreetUnread(false);
    setPoint(suggestion.point);
    setLine1(suggestion.line1);
    setCompleteAddress(suggestion.completeAddress ?? "");
    if (suggestion.landmark) setLandmark((current) => current || suggestion.landmark);
    if (fillLabel && suggestion.label) {
      setLabel((current) => current || suggestion.label.slice(0, ADDRESS_LABEL_MAX));
    }
    setQuery("");
    setResults([]);
    setNotice(null);
  }, []);

  const pickSearch = useCallback(
    (suggestion: DropoffSuggestion) => {
      applySuggestion(suggestion, !options?.initialLabel);
    },
    [applySuggestion, options?.initialLabel],
  );

  const runReverse = useCallback(async (next: GeoPoint) => {
    const gen = ++reverseGen.current;
    setReversing(true);
    setStreetUnread(false);
    setNotice(null);
    try {
      const result = await reverseNominatim(next, appVersion());
      if (gen !== reverseGen.current) return;
      if (result.status === "ok") {
        // The pin is the source of truth: a later tap replaces street even
        // when the field already had text from search or an earlier pin.
        setLine1(result.suggestion.line1);
        setCompleteAddress(result.suggestion.completeAddress ?? "");
        if (result.suggestion.landmark) {
          setLandmark((current) => current || result.suggestion.landmark);
        }
        setNotice(null);
        setStreetUnread(false);
        return;
      }
      setCompleteAddress("");
      if (result.status === "outside_davao") {
        setNotice(OUTSIDE_DAVAO);
        return;
      }
      // OSM had no street — do not invent line1. Caption asks them to type it.
      setStreetUnread(true);
      if (result.status === "failed") setNotice(result.message);
    } finally {
      if (gen === reverseGen.current) setReversing(false);
    }
  }, []);

  const pickPin = useCallback(
    (next: GeoPoint) => {
      setPoint(next);
      void runReverse(next);
    },
    [runReverse],
  );

  const useMyLocation = useCallback(async () => {
    if (locating) return;
    const gen = ++reverseGen.current;
    setLocating(true);
    setNotice(null);
    try {
      const result = await requestCurrentLocation();
      if (gen !== reverseGen.current) return;
      if (result.status !== "ok") {
        setNotice(result.message);
        return;
      }
      const reverse = await reverseNominatim(result.point, appVersion());
      if (gen !== reverseGen.current) return;
      if (reverse.status === "outside_davao") {
        setNotice(OUTSIDE_DAVAO);
        return;
      }
      setPoint(result.point);
      if (reverse.status === "ok") {
        setLine1(reverse.suggestion.line1);
        setCompleteAddress(reverse.suggestion.completeAddress ?? "");
        setStreetUnread(false);
        if (reverse.suggestion.landmark) {
          setLandmark((current) => current || reverse.suggestion.landmark);
        }
        setNotice(null);
      } else {
        setCompleteAddress("");
        setStreetUnread(true);
      }
    } finally {
      setLocating(false);
    }
  }, [locating]);

  const onChangeQuery = useCallback((value: string) => {
    setQuery(value);
    setNotice(null);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    const gen = ++searchGen.current;
    setSearching(true);
    const handle = setTimeout(() => {
      void searchNominatim(q, appVersion()).then((result) => {
        if (gen !== searchGen.current) return;
        setSearching(false);
        if (result.status === "ok") {
          setResults(result.suggestions);
          setNotice(null);
          return;
        }
        setResults([]);
        setNotice(result.message);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (options?.skipPrePin || prePinned.current) return;
    prePinned.current = true;
    void peekCurrentLocation().then(async (result) => {
      if (!result || result.status !== "ok") return;
      if (pointRef.current) return;
      const reverse = await reverseNominatim(result.point, appVersion());
      if (reverse.status === "outside_davao") return;
      if (pointRef.current) return;
      setPoint(result.point);
      if (reverse.status === "ok" && !lineRef.current.trim()) {
        setLine1(reverse.suggestion.line1);
        setCompleteAddress(reverse.suggestion.completeAddress ?? "");
      }
    });
  }, [options?.skipPrePin]);

  const loadSaved = useCallback(
    (input: { label: string; line1: string; landmark: string; point: GeoPoint }) => {
      reverseGen.current += 1;
      setReversing(false);
      setLabel(input.label);
      setLine1(input.line1);
      setLandmark(input.landmark);
      setPoint(input.point);
      setCompleteAddress("");
      setStreetUnread(false);
      prePinned.current = true;
    },
    [],
  );

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
    locating,
    notice,
    setNotice,
    touched,
    setTouched,
    parts,
    addressCheck,
    addressLine,
    ready,
    saveLabel,
    pickSearch,
    pickPin,
    useMyLocation,
    runReverse,
    loadSaved,
    completeAddress,
    reversing,
    pinCaption: reversing
      ? READING_PLACE
      : completeAddress || (streetUnread ? STREET_UNREAD : null),
  };
}
