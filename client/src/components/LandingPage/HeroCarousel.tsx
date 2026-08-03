import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

interface HeroSlide {
  alt: string;
  caption: string;
  src: string;
  srcSet: string;
}

interface HeroCarouselProps {
  label: string;
  nextLabel: string;
  pauseLabel: string;
  playLabel: string;
  previousLabel: string;
  slideLabel: string;
  slides: HeroSlide[];
}

const AUTOPLAY_INTERVAL_MS = 6500;
const SWIPE_THRESHOLD_PX = 48;

export default function HeroCarousel({
  label,
  nextLabel,
  pauseLabel,
  playLabel,
  previousLabel,
  slideLabel,
  slides,
}: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const showPrevious = () => {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    setActiveIndex((current) => (current + 1) % slides.length);
  };

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (
      isFocusWithin ||
      isHovering ||
      isTouching ||
      isUserPaused ||
      prefersReducedMotion ||
      slides.length < 2
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    activeIndex,
    isFocusWithin,
    isHovering,
    isTouching,
    isUserPaused,
    prefersReducedMotion,
    slides.length,
  ]);

  return (
    <div
      className="rekky-landing-hero-media"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setIsFocusWithin(false);
        }
      }}
      onTouchStart={(event) => {
        setIsTouching(true);
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current;
        const endX = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        setIsTouching(false);

        if (startX === null || endX === undefined || Math.abs(startX - endX) < SWIPE_THRESHOLD_PX) {
          return;
        }

        if (startX > endX) {
          showNext();
          return;
        }

        showPrevious();
      }}
      onTouchCancel={() => {
        touchStartX.current = null;
        setIsTouching(false);
      }}
    >
      <div className="rekky-landing-hero-slides" aria-live="off">
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;

          return (
            <picture
              key={slide.src}
              className="rekky-landing-hero-slide"
              data-active={isActive ? 'true' : 'false'}
            >
              <source
                srcSet={slide.srcSet}
                sizes="(min-width: 60rem) 62vw, 100vw"
                type="image/webp"
              />
              <img
                src={slide.src}
                width="1536"
                height="1024"
                loading={index === 0 ? 'eager' : 'lazy'}
                alt={isActive ? slide.alt : ''}
              />
            </picture>
          );
        })}
      </div>

      <div className="rekky-landing-carousel-bar">
        <p>
          <span>{slides[activeIndex]?.caption}</span>
          <span aria-hidden="true">
            {String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>
        </p>

        <div className="rekky-landing-carousel-controls">
          <button type="button" onClick={showPrevious} aria-label={previousLabel}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>

          <div className="rekky-landing-carousel-dots">
            {slides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                data-active={index === activeIndex ? 'true' : 'false'}
                aria-current={index === activeIndex ? 'true' : undefined}
                aria-label={`${slideLabel} ${index + 1}: ${slide.caption}`}
                onClick={() => setActiveIndex(index)}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>

          <button type="button" onClick={showNext} aria-label={nextLabel}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            hidden={prefersReducedMotion}
            onClick={() => setIsUserPaused((current) => !current)}
            aria-label={isUserPaused ? playLabel : pauseLabel}
          >
            {isUserPaused ? (
              <Play size={16} aria-hidden="true" />
            ) : (
              <Pause size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
