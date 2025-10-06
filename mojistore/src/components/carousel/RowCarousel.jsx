import useEmblaCarousel from "embla-carousel-react";
import SmartImage from "../../components/SmartImage.jsx";
import ProductCard from "../../components/ProductCard/ProductCard.jsx";
import { Link } from "react-router-dom";
import "./Embla.css";

export function ProductRow({ title, items = [], loading = false }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: false, containScroll: "trimSnaps" });
  return (
    <section className="home-sec">
      <div className="home-sec-head">
        <h2 className="home-title">{title}</h2>
        <div className="home-rule" />
      </div>

      <div className="embla row">
        <div className="embla__viewport" ref={emblaRef}>
          <div className="embla__container no-scrollbar">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="embla__slide"><div className="skel" /></div>)
              : items.map((p) => (
                  <div key={p.id} className="embla__slide">
                    <ProductCard p={p} />
                  </div>
                ))}
          </div>
        </div>
        <button className="embla__btn embla__btn--prev" onClick={() => emblaApi?.scrollPrev()} aria-label="Prev">‹</button>
        <button className="embla__btn embla__btn--next" onClick={() => emblaApi?.scrollNext()} aria-label="Next">›</button>
      </div>
    </section>
  );
}

export function BrandRow({ brands = [] }) {
  if (!brands.length) return null;
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  return (
    <section className="home-sec">
      <div className="home-sec-head">
        <h2 className="home-title">Featured brands</h2>
        <div className="home-rule" />
      </div>

      <div className="embla brandrow">
        <div className="embla__viewport" ref={emblaRef}>
          <div className="embla__container no-scrollbar">
            {brands.map((b) => (
              <div key={b.id} className="embla__slide">
                <Link to={b.href} className="home-brand block rounded-[14px] border border-white/10 bg-white/5 h-[100px] flex items-center justify-center">
                  {b.image
                    ? <SmartImage image={b.image} alt={b.name} width={320} height={160} className="w-full h-full object-contain rounded-[14px]" />
                    : <div className="p-3 font-semibold">{b.name}</div>}
                </Link>
              </div>
            ))}
          </div>
        </div>
        <button className="embla__btn embla__btn--prev" onClick={() => emblaApi?.scrollPrev()} aria-label="Prev">‹</button>
        <button className="embla__btn embla__btn--next" onClick={() => emblaApi?.scrollNext()} aria-label="Next">›</button>
      </div>
    </section>
  );
}
