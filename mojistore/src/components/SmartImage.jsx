import { useMemo, useState } from "react";
import getProductImage, { placeholder } from "../utils/getProductImage";

export default function SmartImage({
  image,
  alt = "",
  className = "",
  quality = 82,
  fit = "contain",
  width,           // px you want server to resize to
  height,          // px (keeps aspect-ratio)
  sizes,           // responsive sizes attr
  priority = false // true for first hero/banner
}) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Main src @1x
  const src1x = useMemo(() => {
    if (errored) return placeholder();
    return getProductImage(image, {
      q: quality,
      fit,
      width,
      height,
      format: "auto",
    });
  }, [image, quality, fit, width, height, errored]);

  // Hi-DPI src @2x (cap at 2x width to avoid waste)
  const src2x = useMemo(() => {
    if (!width) return null;
    return getProductImage(image, {
      q: Math.max(60, Math.min(quality, 85)),
      fit,
      width: Math.min(width * 2, 1600),
      height: height ? Math.min(height * 2, 1200) : undefined,
      format: "auto",
    });
  }, [image, quality, fit, width, height]);

  // Tiny blurred preview (LQIP)
  const blurSrc = useMemo(() => {
    // very small width, low q
    return getProductImage(image, { q: 40, fit, width: 24, height: height ? 24 * (height/width) : undefined, format: "auto" });
  }, [image, fit, width, height]);

  const style = {
    width: "100%",
    height: "100%",
    objectFit: fit === "cover" ? "cover" : "contain",
    objectPosition: "center",
    display: "block",
    backgroundColor: "#f2f3f5",
    ...(Number.isFinite(width) && Number.isFinite(height)
      ? { aspectRatio: `${width}/${height}` }
      : {}),
    // subtle blur until full image loaded
    filter: loaded ? "none" : "blur(12px)",
    transition: "filter 240ms ease",
  };

  const srcSet = src2x ? `${src1x} 1x, ${src2x} 2x` : undefined;

  return (
    <img
      src={loaded ? src1x : blurSrc}
      srcSet={loaded ? srcSet : undefined}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      sizes={sizes}
      onError={() => setErrored(true)}
      onLoad={() => setLoaded(true)}
      className={className}
      style={style}
      // Priority hint for LCP (supported in Chromium)
      fetchpriority={priority ? "high" : "auto"}
    />
  );
}
