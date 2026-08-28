/**
 * Static image imports.
 *
 * Metro resolves an image to an asset module; TypeScript does not know that on
 * its own, and Expo's own types declare CSS but no image formats. Without this
 * the centralized `constants/images.ts` that AGENTS.md requires cannot be
 * written as an import at all.
 *
 * `ImageSourcePropType` rather than `number`: a required asset is a module id
 * on native and an object on web, and that union is exactly what `<Image
 * source>` takes.
 */

declare module "*.jpg" {
  import type { ImageSourcePropType } from "react-native";

  const source: ImageSourcePropType;
  export default source;
}

declare module "*.jpeg" {
  import type { ImageSourcePropType } from "react-native";

  const source: ImageSourcePropType;
  export default source;
}

declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";

  const source: ImageSourcePropType;
  export default source;
}

declare module "*.webp" {
  import type { ImageSourcePropType } from "react-native";

  const source: ImageSourcePropType;
  export default source;
}
