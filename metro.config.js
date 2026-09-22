// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const base = getDefaultConfig(__dirname);

const config = withNativewind(base, {
  // The whole theme is driven by :root variables that carry a
  // prefers-color-scheme rule. Inlining them at build time would flatten a
  // token to its Light value and break theme switching for that token.
  inlineVariables: false,
});

/**
 * Resolve zustand through its CommonJS build on web.
 *
 * zustand's `exports` map serves native the CJS build (via the `react-native`
 * condition) and everyone else an ESM build whose devtools middleware reads
 * `import.meta.env`. Metro emits web as a classic script, so `import.meta` is a
 * syntax error there and the *entire* bundle fails to evaluate — the page stays
 * blank with one console error and no stack pointing at the cause.
 *
 * Session, theme and the request draft all come through `zustand/middleware`,
 * so this is not an edge case: without it, Expo web does not boot at all.
 *
 * This wraps the resolver **after** `withNativewind`, which installs one of its
 * own; wrapping before would be silently replaced.
 */
const wrapped = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next = wrapped ?? context.resolveRequest;
  
  if (platform === "web" && /^zustand($|\/)/.test(moduleName)) {
    // Node's own resolution takes the `require` branch of the exports map,
    // which is the CommonJS build. Handing Metro the resolved path is exact:
    // asking it to re-resolve under different conditions is not honoured here.
    return {
      type: "sourceFile",
      filePath: require.resolve(moduleName, { paths: [__dirname] }),
    };
  }

  // Fallback for lucide-react-native's broken ESM exports where it looks for non-existent .mjs files
  if (/^lucide-react-native($|\/)/.test(moduleName)) {
    try {
      return {
        type: "sourceFile",
        filePath: require.resolve(moduleName, { paths: [__dirname] }),
      };
    } catch (e) {
      // If require.resolve fails, let it fall through to default resolution
    }
  }
  
  return next(context, moduleName, platform);
};

module.exports = config;
