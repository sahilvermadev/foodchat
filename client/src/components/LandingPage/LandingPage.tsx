import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { ContextualAuthLink } from '~/components/Auth/flow';
import HeroCarousel from './HeroCarousel';
import {
  HeroIngredientIllustration,
  KitchenAdjustmentGraphic,
  VoiceSteamIllustration,
  WebToPhoneIllustration,
} from './Illustrations';
import './LandingPage.css';

export default function LandingPage() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  useGetStartupConfig();

  const heroSlides = [
    {
      src: '/assets/landing/eggplant-table-1600.webp',
      srcSet:
        '/assets/landing/eggplant-table-960.webp 960w, /assets/landing/eggplant-table-1600.webp 1586w',
      alt: localize('com_landing_hero_image_alt'),
      caption: localize('com_landing_hero_caption'),
    },
    {
      src: '/assets/landing/ginger-noodles-1536.webp',
      srcSet:
        '/assets/landing/ginger-noodles-960.webp 960w, /assets/landing/ginger-noodles-1536.webp 1536w',
      alt: localize('com_landing_hero_noodles_alt'),
      caption: localize('com_landing_hero_noodles_caption'),
    },
    {
      src: '/assets/landing/tomato-beans-1536.webp',
      srcSet:
        '/assets/landing/tomato-beans-960.webp 960w, /assets/landing/tomato-beans-1536.webp 1536w',
      alt: localize('com_landing_hero_beans_alt'),
      caption: localize('com_landing_hero_beans_caption'),
    },
    {
      src: '/assets/landing/citrus-cake-1536.webp',
      srcSet:
        '/assets/landing/citrus-cake-960.webp 960w, /assets/landing/citrus-cake-1536.webp 1536w',
      alt: localize('com_landing_hero_cake_alt'),
      caption: localize('com_landing_hero_cake_caption'),
    },
  ];

  return (
    <div className="rekky-landing rekky-ui" data-testid="landing-page">
      <a className="rekky-landing-skip" href="#landing-main">
        {localize('com_landing_skip')}
      </a>

      <header className="rekky-landing-masthead">
        <Link
          className="rekky-wordmark rekky-landing-wordmark"
          to="/"
          aria-label={localize('com_landing_home')}
        >
          {localize('com_landing_brand')}
        </Link>
        <nav aria-label={localize('com_landing_nav_label')}>
          <div className="rekky-landing-nav-actions">
            {isAuthenticated ? (
              <Link to="/cook">{localize('com_landing_open')}</Link>
            ) : (
              <ContextualAuthLink mode="login">{localize('com_auth_login')}</ContextualAuthLink>
            )}
            <a className="rekky-landing-nav-cta" href="#get-the-app">
              {localize('com_landing_get_app')}
            </a>
          </div>
        </nav>
      </header>

      <main id="landing-main">
        <section className="rekky-landing-photo-hero" aria-labelledby="landing-title">
          <HeroCarousel
            slides={heroSlides}
            label={localize('com_landing_carousel_label')}
            previousLabel={localize('com_landing_carousel_previous')}
            nextLabel={localize('com_landing_carousel_next')}
            pauseLabel={localize('com_landing_carousel_pause')}
            playLabel={localize('com_landing_carousel_play')}
            slideLabel={localize('com_landing_carousel_slide')}
          />
          <div className="rekky-landing-hero-copy">
            <h1 id="landing-title">{localize('com_landing_title')}</h1>
            <p>{localize('com_landing_lede')}</p>

            <Link className="rekky-landing-text-link" to="/cook">
              {localize('com_landing_no_link')}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <HeroIngredientIllustration />
          </div>
        </section>

        <section
          id="change-the-recipe"
          className="rekky-landing-change"
          aria-labelledby="landing-change-title"
        >
          <div className="rekky-landing-change-copy">
            <h2 id="landing-change-title">{localize('com_landing_change_title')}</h2>
            <p>{localize('com_landing_change_body')}</p>
          </div>

          <div className="rekky-landing-change-proof">
            <blockquote>{localize('com_landing_change_request')}</blockquote>
            <KitchenAdjustmentGraphic
              equipment={{
                label: localize('com_landing_change_equipment'),
                before: localize('com_landing_change_equipment_before'),
                after: localize('com_landing_change_equipment_after'),
              }}
              ingredient={{
                label: localize('com_landing_change_ingredient'),
                before: localize('com_landing_change_ingredient_before'),
                after: localize('com_landing_change_ingredient_after'),
              }}
              servings={{
                label: localize('com_landing_change_servings'),
                before: localize('com_landing_change_servings_before'),
                after: localize('com_landing_change_servings_after'),
              }}
              imageAlt={localize('com_landing_mobile_canvas_alt')}
              caption={localize('com_landing_mobile_canvas_caption')}
              detail={localize('com_landing_mobile_canvas_detail')}
            />
          </div>
        </section>

        <section
          id="cook-hands-free"
          className="rekky-landing-voice-photo"
          aria-labelledby="landing-voice-title"
        >
          <picture>
            <source
              srcSet="/assets/landing/hands-free-kitchen-960.webp 960w, /assets/landing/hands-free-kitchen-1600.webp 1536w"
              sizes="100vw"
              type="image/webp"
            />
            <img
              src="/assets/landing/hands-free-kitchen-1600.webp"
              width="1536"
              height="1024"
              loading="lazy"
              alt={localize('com_landing_voice_image_alt')}
            />
          </picture>
          <div className="rekky-landing-photo-scrim" aria-hidden="true" />
          <VoiceSteamIllustration />
          <div className="rekky-landing-voice-copy">
            <h2 id="landing-voice-title">{localize('com_landing_voice_title')}</h2>
            <p>{localize('com_landing_voice_body')}</p>
          </div>
        </section>

        <section
          id="get-the-app"
          className="rekky-landing-close"
          aria-labelledby="landing-close-title"
        >
          <div className="rekky-landing-close-copy">
            <h2 id="landing-close-title">{localize('com_landing_close_title')}</h2>
            <p>{localize('com_landing_close_body')}</p>
          </div>
          <WebToPhoneIllustration />
          <div className="rekky-landing-close-actions">
            <ContextualAuthLink mode="register">
              {localize('com_landing_close_action')}
              <ArrowRight size={20} aria-hidden="true" />
            </ContextualAuthLink>
          </div>
        </section>
      </main>

      <footer className="rekky-landing-footer">
        <span className="rekky-wordmark rekky-landing-wordmark">
          {localize('com_landing_brand')}
        </span>
        <p>{localize('com_landing_footer_statement')}</p>
        <div>
          <a href="#get-the-app">{localize('com_landing_footer_mobile')}</a>
        </div>
      </footer>
    </div>
  );
}
