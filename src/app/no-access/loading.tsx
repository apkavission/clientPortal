import { BrandLoader } from "@/components/brand/brand-loader";

/** The one loader, as an overlay. Same across the estate. */
export default function Loading() {
  return <BrandLoader overlay showLabel />;
}
