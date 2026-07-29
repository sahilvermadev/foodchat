import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  Link2,
  ListChecks,
  MessageCircle,
  ShoppingBasket,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useAuthContext, useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import './LandingPage.css';

type JourneyStage = 0 | 1 | 2 | 3;

const enterTransition = {
  duration: 0.42,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

function normalizeImportUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function SoundWave({ active = false }: { active?: boolean }) {
  return (
    <span className="rekky-landing-wave" data-active={active || undefined} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((bar) => (
        <span key={bar} style={{ '--wave-index': bar } as CSSProperties} />
      ))}
    </span>
  );
}

function RecipePreview({ stage, compact = false }: { stage: JourneyStage; compact?: boolean }) {
  const localize = useLocalize();
  const ingredients = useMemo(
    () => [
      {
        amount:
          stage >= 1
            ? localize('com_landing_demo_amount_eggplant_scaled')
            : localize('com_landing_demo_amount_eggplant'),
        name: localize('com_landing_demo_ingredient_eggplant'),
      },
      {
        amount:
          stage >= 1
            ? localize('com_landing_demo_amount_yogurt_scaled')
            : localize('com_landing_demo_amount_yogurt'),
        name: localize('com_landing_demo_ingredient_yogurt'),
      },
      {
        amount:
          stage >= 1
            ? localize('com_landing_demo_amount_mint_scaled')
            : localize('com_landing_demo_amount_mint'),
        name: localize('com_landing_demo_ingredient_mint'),
      },
    ],
    [localize, stage],
  );

  return (
    <article className="rekky-landing-recipe" data-compact={compact || undefined}>
      <div className="rekky-landing-recipe-source">
        <span>{localize('com_landing_demo_source')}</span>
        <ExternalLink size={13} aria-hidden="true" />
      </div>
      <h3>{localize('com_landing_demo_title')}</h3>
      <p className="rekky-landing-recipe-dek">{localize('com_landing_demo_description')}</p>

      <div
        className="rekky-landing-recipe-meta"
        aria-label={localize('com_landing_demo_meta_label')}
      >
        <span>
          <small>{localize('com_landing_demo_prep_label')}</small>
          {localize('com_landing_demo_prep_value')}
        </span>
        <span>
          <small>{localize('com_landing_demo_cook_label')}</small>
          {localize('com_landing_demo_cook_value')}
        </span>
        <span>
          <small>{localize('com_landing_demo_servings_label')}</small>
          {stage >= 1
            ? localize('com_landing_demo_servings_scaled')
            : localize('com_landing_demo_servings_value')}
        </span>
      </div>

      {stage >= 1 ? (
        <>
          <div className="rekky-landing-recipe-context">
            <span>{localize('com_landing_demo_tag_vegetarian')}</span>
            <span>{localize('com_landing_demo_tag_adjusted')}</span>
          </div>
          <motion.div
            className="rekky-landing-recipe-adjustment"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enterTransition}
          >
            <Sparkles size={14} aria-hidden="true" />
            <span>
              <small>{localize('com_landing_demo_adjustment_label')}</small>
              <strong>{localize('com_landing_demo_adjustment_value')}</strong>
            </span>
          </motion.div>
        </>
      ) : null}

      <div className="rekky-landing-recipe-section-head">
        <h4>{localize('com_landing_demo_ingredients')}</h4>
        {stage >= 2 ? (
          <span className="rekky-landing-added-label">
            <Check size={13} aria-hidden="true" />
            {localize('com_landing_demo_added')}
          </span>
        ) : null}
      </div>
      <ul className="rekky-landing-ingredient-list">
        {ingredients.map((ingredient, index) => (
          <li key={ingredient.name}>
            <span className="rekky-landing-check" data-checked={stage >= 2 || undefined}>
              {stage >= 2 ? <Check size={12} aria-hidden="true" /> : null}
            </span>
            <motion.strong layout="position" transition={enterTransition}>
              {ingredient.amount}
            </motion.strong>
            <span>{ingredient.name}</span>
            {stage >= 2 && index < 2 ? (
              <small>{localize('com_landing_demo_for_two_recipes')}</small>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="rekky-landing-method">
        <div className="rekky-landing-method-number">1</div>
        <p>{localize('com_landing_demo_method')}</p>
        {stage >= 3 ? (
          <motion.span
            className="rekky-landing-timer"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enterTransition}
          >
            <Clock3 size={14} aria-hidden="true" />
            {localize('com_landing_demo_timer')}
          </motion.span>
        ) : null}
      </div>
    </article>
  );
}

function JourneyStep({
  index,
  active,
  title,
  body,
  onActive,
}: {
  index: JourneyStage;
  active: boolean;
  title: string;
  body: string;
  onActive: (stage: JourneyStage) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0.65, margin: '-12% 0px -22% 0px' });

  useEffect(() => {
    if (isInView) {
      onActive(index);
    }
  }, [index, isInView, onActive]);

  return (
    <div ref={ref} className="rekky-landing-journey-step" data-active={active || undefined}>
      <span>{String(index + 1).padStart(2, '0')}</span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="rekky-landing-journey-mobile-preview">
          <RecipePreview stage={index} compact />
        </div>
      </div>
    </div>
  );
}

function TrustStatement({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li>
      <span className="rekky-landing-trust-icon">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

export default function LandingPage() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { isAuthenticated } = useAuthContext();
  const [sourceUrl, setSourceUrl] = useState('');
  const [urlError, setUrlError] = useState<'hero' | 'final' | null>(null);
  const [heroStage, setHeroStage] = useState<JourneyStage>(reduceMotion ? 3 : 0);
  const [journeyStage, setJourneyStage] = useState<JourneyStage>(0);
  const [voiceActive, setVoiceActive] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      setHeroStage(3);
      return;
    }

    const timers = [
      window.setTimeout(() => setHeroStage(1), 650),
      window.setTimeout(() => setHeroStage(2), 1350),
      window.setTimeout(() => setHeroStage(3), 2050),
    ];

    return () => timers.forEach(window.clearTimeout);
  }, [reduceMotion]);

  const beginImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUrl = normalizeImportUrl(sourceUrl);
    if (!normalizedUrl) {
      setUrlError(event.currentTarget.id === 'try-rekky' ? 'hero' : 'final');
      return;
    }

    const importTarget = `/imports/share?${new URLSearchParams({ url: normalizedUrl }).toString()}`;
    navigate(
      isAuthenticated ? importTarget : `/register?redirect_to=${encodeURIComponent(importTarget)}`,
    );
  };

  const replayHero = () => {
    setHeroStage(0);
    if (reduceMotion) {
      window.setTimeout(() => setHeroStage(3), 150);
      return;
    }
    window.setTimeout(() => setHeroStage(1), 250);
    window.setTimeout(() => setHeroStage(2), 750);
    window.setTimeout(() => setHeroStage(3), 1250);
  };

  return (
    <div className="rekky-landing rekky-ui">
      <a className="rekky-landing-skip" href="#landing-main">
        {localize('com_landing_skip')}
      </a>

      <header className="rekky-landing-header">
        <Link
          className="rekky-wordmark rekky-landing-wordmark"
          to="/"
          aria-label={localize('com_landing_home')}
        >
          {localize('com_landing_brand')}
        </Link>
        <nav aria-label={localize('com_landing_nav_label')}>
          <a href="#how-it-works">{localize('com_landing_nav_how')}</a>
          <Link to={isAuthenticated ? '/cook' : '/login?redirect_to=%2Fcook'}>
            {isAuthenticated ? localize('com_landing_open') : localize('com_auth_login')}
          </Link>
          <a className="rekky-landing-header-cta" href="#try-rekky">
            {localize('com_landing_try')}
          </a>
        </nav>
      </header>

      <main id="landing-main">
        <section className="rekky-landing-hero" aria-labelledby="landing-title">
          <div className="rekky-landing-hero-copy">
            <p className="rekky-landing-kicker">{localize('com_landing_kicker')}</p>
            <h1 id="landing-title">{localize('com_landing_title')}</h1>
            <p className="rekky-landing-lede">{localize('com_landing_lede')}</p>

            <form
              id="try-rekky"
              className="rekky-landing-import-form"
              onSubmit={beginImport}
              noValidate
            >
              <label htmlFor="landing-source-url">{localize('com_landing_import_label')}</label>
              <div
                className="rekky-landing-import-control"
                data-error={urlError === 'hero' || undefined}
              >
                <Link2 size={19} aria-hidden="true" />
                <input
                  id="landing-source-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  value={sourceUrl}
                  aria-invalid={urlError === 'hero'}
                  aria-describedby={urlError === 'hero' ? 'landing-url-error' : 'landing-url-hint'}
                  placeholder={localize('com_landing_import_placeholder')}
                  onChange={(event) => {
                    setSourceUrl(event.target.value);
                    setUrlError(null);
                  }}
                />
                <button type="submit">
                  <span>{localize('com_landing_import_action')}</span>
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
              <p
                id={urlError === 'hero' ? 'landing-url-error' : 'landing-url-hint'}
                className="rekky-landing-form-note"
              >
                {urlError === 'hero'
                  ? localize('com_landing_import_error')
                  : localize('com_landing_import_hint')}
              </p>
            </form>

            <Link className="rekky-landing-text-link" to="/cook">
              {localize('com_landing_no_link')}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="rekky-landing-hero-demo" aria-label={localize('com_landing_demo_label')}>
            <div className="rekky-landing-thread" aria-hidden="true">
              <span data-complete={heroStage >= 0 || undefined} />
              <span data-complete={heroStage >= 1 || undefined} />
              <span data-complete={heroStage >= 2 || undefined} />
              <span data-complete={heroStage >= 3 || undefined} />
            </div>
            <div className="rekky-landing-source-slip">
              <Link2 size={15} aria-hidden="true" />
              <span>{localize('com_landing_demo_url')}</span>
              <small>{localize('com_landing_demo_read')}</small>
            </div>
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={enterTransition}
            >
              <RecipePreview stage={heroStage} compact />
            </motion.div>
            <button type="button" className="rekky-landing-replay" onClick={replayHero}>
              {localize('com_landing_replay')}
            </button>
          </div>
        </section>

        <div
          className="rekky-landing-source-row"
          aria-label={localize('com_landing_sources_label')}
        >
          <span>{localize('com_landing_sources_web')}</span>
          <span>{localize('com_landing_sources_youtube')}</span>
          <span>{localize('com_landing_sources_instagram')}</span>
          <span>{localize('com_landing_sources_tiktok')}</span>
          <span>{localize('com_landing_sources_text')}</span>
        </div>

        <section className="rekky-landing-problem" aria-labelledby="landing-problem-title">
          <div>
            <p className="rekky-landing-kicker">{localize('com_landing_problem_kicker')}</p>
            <h2 id="landing-problem-title">{localize('com_landing_problem_title')}</h2>
          </div>
          <p>{localize('com_landing_problem_body')}</p>
          <div className="rekky-landing-source-fragments" aria-hidden="true">
            <span>{localize('com_landing_fragment_video')}</span>
            <span>{localize('com_landing_fragment_blog')}</span>
            <span>{localize('com_landing_fragment_note')}</span>
            <ArrowRight size={22} />
            <strong>{localize('com_landing_fragment_ready')}</strong>
          </div>
        </section>

        <section
          id="how-it-works"
          className="rekky-landing-journey"
          aria-labelledby="landing-journey-title"
        >
          <div className="rekky-landing-journey-intro">
            <div>
              <p className="rekky-landing-kicker">{localize('com_landing_journey_kicker')}</p>
              <h2 id="landing-journey-title">{localize('com_landing_journey_title')}</h2>
            </div>
            <p>{localize('com_landing_journey_body')}</p>
          </div>
          <div className="rekky-landing-journey-grid">
            <div className="rekky-landing-journey-copy">
              <JourneyStep
                index={0}
                active={journeyStage === 0}
                title={localize('com_landing_journey_import_title')}
                body={localize('com_landing_journey_import_body')}
                onActive={setJourneyStage}
              />
              <JourneyStep
                index={1}
                active={journeyStage === 1}
                title={localize('com_landing_journey_adapt_title')}
                body={localize('com_landing_journey_adapt_body')}
                onActive={setJourneyStage}
              />
              <JourneyStep
                index={2}
                active={journeyStage === 2}
                title={localize('com_landing_journey_shop_title')}
                body={localize('com_landing_journey_shop_body')}
                onActive={setJourneyStage}
              />
              <JourneyStep
                index={3}
                active={journeyStage === 3}
                title={localize('com_landing_journey_cook_title')}
                body={localize('com_landing_journey_cook_body')}
                onActive={setJourneyStage}
              />
            </div>
            <div className="rekky-landing-journey-preview">
              <RecipePreview stage={journeyStage} />
            </div>
          </div>
        </section>

        <section className="rekky-landing-personal" aria-labelledby="landing-personal-title">
          <div className="rekky-landing-personal-copy">
            <p className="rekky-landing-kicker">{localize('com_landing_personal_kicker')}</p>
            <h2 id="landing-personal-title">{localize('com_landing_personal_title')}</h2>
            <p>{localize('com_landing_personal_body')}</p>
          </div>
          <div className="rekky-landing-adaptation">
            <div className="rekky-landing-adaptation-request">
              <span>{localize('com_landing_adaptation_request_label')}</span>
              <blockquote>{localize('com_landing_adaptation_request')}</blockquote>
            </div>
            <div className="rekky-landing-adaptation-result">
              <div>
                <Sparkles size={16} aria-hidden="true" />
                <strong>{localize('com_landing_adaptation_result')}</strong>
              </div>
              <dl>
                <div>
                  <dt>{localize('com_landing_adaptation_equipment_label')}</dt>
                  <dd>
                    <span>{localize('com_landing_adaptation_equipment_before')}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                    <strong>{localize('com_landing_adaptation_equipment_after')}</strong>
                  </dd>
                </div>
                <div>
                  <dt>{localize('com_landing_adaptation_ingredient_label')}</dt>
                  <dd>
                    <span>{localize('com_landing_adaptation_ingredient_before')}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                    <strong>{localize('com_landing_adaptation_ingredient_after')}</strong>
                  </dd>
                </div>
              </dl>
              <p>
                <Link2 size={14} aria-hidden="true" />
                {localize('com_landing_adaptation_source')}
              </p>
            </div>
          </div>
        </section>

        <section className="rekky-landing-voice" aria-labelledby="landing-voice-title">
          <div className="rekky-landing-voice-copy">
            <p className="rekky-landing-kicker">{localize('com_landing_voice_kicker')}</p>
            <h2 id="landing-voice-title">{localize('com_landing_voice_title')}</h2>
            <p>{localize('com_landing_voice_body')}</p>
            <button
              type="button"
              className="rekky-landing-voice-button"
              aria-pressed={voiceActive}
              onClick={() => setVoiceActive((current) => !current)}
            >
              <SoundWave active={voiceActive} />
              {voiceActive
                ? localize('com_landing_voice_listening')
                : localize('com_landing_voice_try')}
            </button>
          </div>
          <div className="rekky-landing-active-step">
            <span>{localize('com_landing_voice_step')}</span>
            <div
              className="rekky-landing-voice-signals"
              aria-label={localize('com_landing_voice_signals_label')}
            >
              <span>
                <Check size={13} aria-hidden="true" />
                {localize('com_landing_voice_noise_status')}
              </span>
              <span>
                <Check size={13} aria-hidden="true" />
                {localize('com_landing_voice_context_status')}
              </span>
            </div>
            <h3>{localize('com_landing_voice_instruction')}</h3>
            <span className="rekky-landing-inline-timer">
              <Clock3 size={16} aria-hidden="true" />
              {localize('com_landing_voice_timer')}
            </span>
            <div
              className="rekky-landing-voice-answer"
              data-active={voiceActive || undefined}
              aria-hidden={!voiceActive}
              aria-live="polite"
            >
              <Volume2 size={17} aria-hidden="true" />
              <div>
                <strong>{localize('com_landing_voice_question')}</strong>
                <p>{localize('com_landing_voice_answer')}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rekky-landing-continuity" aria-labelledby="landing-continuity-title">
          <div className="rekky-landing-continuity-head">
            <div>
              <p className="rekky-landing-kicker">{localize('com_landing_continuity_kicker')}</p>
              <h2 id="landing-continuity-title">{localize('com_landing_continuity_title')}</h2>
            </div>
            <p>{localize('com_landing_continuity_body')}</p>
          </div>
          <div className="rekky-landing-continuity-grid">
            <article className="rekky-landing-cookbook-entry">
              <span>{localize('com_landing_continuity_recipe_label')}</span>
              <h3>{localize('com_landing_continuity_recipe_one')}</h3>
              <p>{localize('com_landing_continuity_recipe_meta')}</p>
              <div>
                <Check size={14} aria-hidden="true" />
                {localize('com_landing_continuity_recipe_state')}
              </div>
            </article>
            <div className="rekky-landing-continuity-link" aria-hidden="true">
              <span />
              <ShoppingBasket size={20} />
              <span />
            </div>
            <article className="rekky-landing-shopping-entry">
              <div>
                <ShoppingBasket size={18} aria-hidden="true" />
                <h3>{localize('com_landing_continuity_shopping')}</h3>
              </div>
              <ul>
                <li>
                  <span className="rekky-landing-check" />
                  <strong>{localize('com_landing_continuity_garlic')}</strong>
                  <small>{localize('com_landing_continuity_two_recipes')}</small>
                </li>
                <li>
                  <span className="rekky-landing-check" />
                  <strong>{localize('com_landing_continuity_yogurt')}</strong>
                  <small>{localize('com_landing_continuity_one_recipe')}</small>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="rekky-landing-trust" aria-labelledby="landing-trust-title">
          <div>
            <p className="rekky-landing-kicker">{localize('com_landing_trust_kicker')}</p>
            <h2 id="landing-trust-title">{localize('com_landing_trust_title')}</h2>
          </div>
          <ul>
            <TrustStatement icon={<ExternalLink size={17} aria-hidden="true" />}>
              {localize('com_landing_trust_source')}
            </TrustStatement>
            <TrustStatement icon={<Sparkles size={17} aria-hidden="true" />}>
              {localize('com_landing_trust_distinction')}
            </TrustStatement>
            <TrustStatement icon={<ListChecks size={17} aria-hidden="true" />}>
              {localize('com_landing_trust_editable')}
            </TrustStatement>
            <TrustStatement icon={<CircleAlert size={17} aria-hidden="true" />}>
              {localize('com_landing_trust_safety')}
            </TrustStatement>
          </ul>
        </section>

        <section className="rekky-landing-faq" aria-labelledby="landing-faq-title">
          <div>
            <p className="rekky-landing-kicker">{localize('com_landing_faq_kicker')}</p>
            <h2 id="landing-faq-title">{localize('com_landing_faq_title')}</h2>
          </div>
          <div className="rekky-landing-faq-list">
            {(
              [
                ['com_landing_faq_sources_q', 'com_landing_faq_sources_a'],
                ['com_landing_faq_edit_q', 'com_landing_faq_edit_a'],
                ['com_landing_faq_sync_q', 'com_landing_faq_sync_a'],
                ['com_landing_faq_voice_q', 'com_landing_faq_voice_a'],
              ] as Array<[TranslationKeys, TranslationKeys]>
            ).map(([question, answer]) => (
              <details key={question}>
                <summary>
                  <span>{localize(question)}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{localize(answer)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rekky-landing-close" aria-labelledby="landing-close-title">
          <div>
            <MessageCircle size={22} aria-hidden="true" />
            <h2 id="landing-close-title">{localize('com_landing_close_title')}</h2>
          </div>
          <form
            id="try-rekky-final"
            className="rekky-landing-import-form"
            onSubmit={beginImport}
            noValidate
          >
            <label htmlFor="landing-source-url-final">{localize('com_landing_import_label')}</label>
            <div
              className="rekky-landing-import-control"
              data-error={urlError === 'final' || undefined}
            >
              <Link2 size={19} aria-hidden="true" />
              <input
                id="landing-source-url-final"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={sourceUrl}
                aria-invalid={urlError === 'final'}
                aria-describedby={urlError === 'final' ? 'landing-final-url-error' : undefined}
                placeholder={localize('com_landing_import_placeholder')}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                  setUrlError(null);
                }}
              />
              <button type="submit">
                <span>{localize('com_landing_import_action')}</span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            {urlError === 'final' ? (
              <p id="landing-final-url-error" className="rekky-landing-form-note">
                {localize('com_landing_import_error')}
              </p>
            ) : null}
          </form>
        </section>
      </main>

      <footer className="rekky-landing-footer">
        <span className="rekky-wordmark rekky-landing-wordmark">
          {localize('com_landing_brand')}
        </span>
        <p>{localize('com_landing_footer_statement')}</p>
        <div>
          <Link to="/login">{localize('com_auth_login')}</Link>
          <Link to="/register">{localize('com_auth_sign_up')}</Link>
        </div>
      </footer>
    </div>
  );
}
