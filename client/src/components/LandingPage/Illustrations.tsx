interface AdjustmentCopy {
  label: string;
  before: string;
  after: string;
}

interface KitchenAdjustmentGraphicProps {
  equipment: AdjustmentCopy;
  ingredient: AdjustmentCopy;
  servings: AdjustmentCopy;
  imageAlt: string;
  caption: string;
  detail: string;
}

type AdjustmentKind = 'equipment' | 'ingredient' | 'servings';

interface AdjustmentNoteProps extends AdjustmentCopy {
  kind: AdjustmentKind;
}

export function HeroIngredientIllustration() {
  return (
    <svg
      className="rekky-landing-hero-illustration"
      data-testid="landing-hero-illustration"
      viewBox="0 0 420 170"
      role="presentation"
      aria-hidden="true"
    >
      <path className="rekky-hero-ingredient-ground" d="M20 137c90 15 284 15 380-3" />

      <g className="rekky-hero-eggplant">
        <path
          className="rekky-hero-eggplant-fruit"
          d="M95 45c18 14 25 38 16 61-10 26-39 36-67 20-25-14-27-39-9-57 15-16 37-17 60-24Z"
        />
        <path
          className="rekky-illustration-herb"
          d="M80 50c7-16 18-25 33-24-5 8-6 15-3 24-10-5-19-5-30 0Z"
        />
        <path d="M106 31c9-11 18-15 29-14" />
      </g>

      <g className="rekky-hero-lemon">
        <path className="rekky-illustration-fill" d="M142 112c9-43 46-67 85-53-9 43-45 67-85 53Z" />
        <path d="M151 106c11-31 39-49 68-42M181 87l-30 19M181 87l38-23M181 87l-2-37" />
      </g>

      <g className="rekky-hero-mint">
        <path d="M252 133c0-50 7-86 30-116" />
        <path
          className="rekky-illustration-herb"
          d="M262 87c19-8 35-3 44 12-19 9-34 4-44-12ZM268 65c-16-2-27-12-27-27 17 0 28 9 27 27ZM255 113c-16 0-28 9-31 23 17 2 28-7 31-23Z"
        />
      </g>

      <g className="rekky-hero-pomegranate">
        <path
          className="rekky-hero-pomegranate-rind"
          d="M320 57c8-11 19-16 33-16s26 5 34 15l-8-1 3 9c13 10 20 24 17 39-4 23-25 38-49 35-25-3-41-22-38-45 2-12 8-22 18-29l2-9Z"
        />
        <path d="M326 91c13-18 43-19 59-2-13 20-44 22-59 2Z" />
        <circle className="rekky-hero-pomegranate-seed" cx="342" cy="91" r="4" />
        <circle className="rekky-hero-pomegranate-seed" cx="355" cy="84" r="4" />
        <circle className="rekky-hero-pomegranate-seed" cx="369" cy="92" r="4" />
        <circle className="rekky-hero-pomegranate-seed" cx="355" cy="101" r="4" />
      </g>

      <circle className="rekky-hero-scattered-seed" cx="301" cy="126" r="4" />
      <circle className="rekky-hero-scattered-seed" cx="411" cy="111" r="3" />
    </svg>
  );
}

function EquipmentMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M11 34.5c1.8 10.4 10.3 17.8 21 17.8s19.2-7.4 21-17.8H11Z" />
      <path d="M17 45.5h30M44.8 11.5 28.7 30.8M48.4 8.3l4.2 3.5-6 7.2-4.2-3.5z" />
      <path
        className="rekky-illustration-fill"
        d="M15.5 34.5h33c-2.2 7.7-8.2 12.2-16.5 12.2s-14.3-4.5-16.5-12.2Z"
      />
    </svg>
  );
}

function IngredientMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32.5 53.5c.4-17.2 2.9-28.8 10.9-41" />
      <path
        className="rekky-illustration-herb"
        d="M36.8 33.6C44 31.8 51.2 34 54 40.2c-7.3 2.2-13.7.2-17.2-6.6ZM37.5 26.7c-6.9-1-12.1-5.3-12.5-11.4 7-.1 12 3.9 12.5 11.4ZM31.6 41.6c-6.1.4-11.2 4-12.6 9.4 6.3.9 11.1-2.5 12.6-9.4Z"
      />
      <path d="m14.5 15.5 35 35M49.5 15.5l-35 35" />
    </svg>
  );
}

function ServingsMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse className="rekky-illustration-fill" cx="32" cy="33" rx="22" ry="13" />
      <ellipse cx="32" cy="30" rx="22" ry="13" />
      <ellipse cx="32" cy="30" rx="11" ry="6" />
      <path d="M12 40.5c3.7 7 11 11.2 20 11.2s16.3-4.2 20-11.2" />
      <path className="rekky-illustration-accent" d="M27 30h10M32 25v10" />
    </svg>
  );
}

const marks: Record<AdjustmentKind, () => JSX.Element> = {
  equipment: EquipmentMark,
  ingredient: IngredientMark,
  servings: ServingsMark,
};

function AdjustmentNote({ kind, label, before, after }: AdjustmentNoteProps) {
  const Mark = marks[kind];

  return (
    <div className={`rekky-landing-adjustment-note rekky-landing-adjustment-note--${kind}`}>
      <span className="rekky-landing-adjustment-mark">
        <Mark />
      </span>
      <dl>
        <dt>{label}</dt>
        <dd>
          <s>{before}</s>
          <span aria-hidden="true">→</span>
          <strong>{after}</strong>
        </dd>
      </dl>
    </div>
  );
}

export function KitchenAdjustmentGraphic({
  equipment,
  ingredient,
  servings,
  imageAlt,
  caption,
  detail,
}: KitchenAdjustmentGraphicProps) {
  return (
    <div className="rekky-landing-adjustment-stage" data-testid="landing-adjustment-graphic">
      <svg
        className="rekky-landing-adjustment-paths"
        viewBox="0 0 1200 760"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="rekky-landing-adjustment-path" d="M245 184C390 184 403 278 516 302" />
        <path className="rekky-landing-adjustment-path" d="M966 185C814 185 795 280 688 303" />
        <path className="rekky-landing-adjustment-path" d="M960 570C815 570 793 478 686 450" />
        <circle className="rekky-landing-adjustment-dot" cx="516" cy="302" r="7" />
        <circle className="rekky-landing-adjustment-dot" cx="688" cy="303" r="7" />
        <circle className="rekky-landing-adjustment-dot" cx="686" cy="450" r="7" />
      </svg>

      <AdjustmentNote kind="equipment" {...equipment} />
      <AdjustmentNote kind="ingredient" {...ingredient} />
      <AdjustmentNote kind="servings" {...servings} />

      <figure className="rekky-landing-product-proof">
        <div className="rekky-landing-phone-capture">
          <img
            src="/assets/landing/rekky-mobile-recipe.webp"
            width="842"
            height="1869"
            loading="lazy"
            alt={imageAlt}
          />
        </div>
        <figcaption>
          <strong>{caption}</strong>
          <span>{detail}</span>
        </figcaption>
      </figure>
    </div>
  );
}

export function VoiceSteamIllustration() {
  return (
    <svg
      className="rekky-landing-voice-steam"
      viewBox="0 0 320 220"
      role="presentation"
      aria-hidden="true"
    >
      <path
        className="rekky-voice-steam-line rekky-voice-steam-line--one"
        d="M68 184c-34-48 30-61 0-110-15-24-5-43 16-58"
      />
      <path
        className="rekky-voice-steam-line rekky-voice-steam-line--two"
        d="M132 190c-30-37 20-59 2-96-12-25-3-47 17-64"
      />
      <path
        className="rekky-voice-steam-line rekky-voice-steam-line--three"
        d="M194 184c-27-38 24-53 7-88-11-23-2-43 20-58"
      />
      <g className="rekky-voice-wave">
        <path d="M223 139v22M237 129v42M251 117v66M265 128v44M279 139v22" />
      </g>
      <path className="rekky-voice-steam-saucer" d="M37 194c48 18 172 18 220 0" />
    </svg>
  );
}

export function WebToPhoneIllustration() {
  return (
    <div
      className="rekky-landing-web-to-phone"
      data-testid="landing-web-to-phone-illustration"
      aria-hidden="true"
    >
      <svg className="rekky-web-source-mark" viewBox="0 0 170 150" role="presentation">
        <path className="rekky-web-source-sheet" d="m20 26 126-9 8 109-31-4-25 10-25-6-38 10Z" />
        <path d="m48 50 67-5M50 65l80-6M52 80l49-4" />
        <circle className="rekky-web-source-globe" cx="74" cy="107" r="18" />
        <path d="M56 107h36M74 89c8 9 8 27 0 36M74 89c-8 9-8 27 0 36" />
        <path
          className="rekky-web-source-link"
          d="m105 98 9-9c8-8 20 4 12 12l-8 8m-6-3-9 9c-8 8-20-4-12-12l8-8"
        />
      </svg>

      <svg className="rekky-web-transfer-mark" viewBox="0 0 130 80" role="presentation">
        <path className="rekky-web-transfer-path" d="M8 42c37-31 72 30 108-2" />
        <path className="rekky-web-transfer-arrow" d="m104 31 14 9-10 14" />
      </svg>

      <svg className="rekky-phone-drawing" viewBox="0 0 112 186" role="presentation">
        <path
          className="rekky-phone-drawing-body"
          d="M27 5c-9 1-14 7-15 17L7 158c0 13 7 20 19 21l55 2c13 0 20-7 21-20l3-134c0-13-7-20-19-21Z"
        />
        <ellipse className="rekky-phone-drawing-dish" cx="55" cy="63" rx="25" ry="15" />
        <ellipse cx="55" cy="59" rx="25" ry="15" />
        <path className="rekky-phone-drawing-garnish" d="M49 59c8-11 18-12 25-3-8 11-17 12-25 3Z" />
        <path d="M29 91h48M29 103h39M28 116h50M28 128h31M28 140h43" />
        <path className="rekky-phone-drawing-accent" d="M78 138v12M72 144h12" />
      </svg>
    </div>
  );
}
