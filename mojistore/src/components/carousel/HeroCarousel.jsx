import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import SmartImage from "../../components/SmartImage.jsx";
import { Link } from "react-router-dom";
import "./Embla.css";

export default function HeroCarousel({ banners = [] }) {
  if (!banners.length) return null;
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", duration: 18 },
    [Autoplay({ delay: 4000, stopOnInteraction: true })]
  );
  return (
    <section className="home-hero embla hero">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {banners.map((b) => (
            <div key={b.id} className="embla__slide">
              <Link to={b.href} className="block w-full h-full">
                <SmartImage
                  image={b.img}
                  alt={b.alt || ""}
                  width={1600}
                  height={520}
                  className="w-full h-full object-cover rounded-2xl"
                />
              </Link>
            </div>
          ))}
        </div>
      </div>
      <button className="embla__btn embla__btn--prev" onClick={() => emblaApi?.scrollPrev()} aria-label="Prev">‹</button>
      <button className="embla__btn embla__btn--next" onClick={() => emblaApi?.scrollNext()} aria-label="Next">›</button>
    </section>
  );
}
