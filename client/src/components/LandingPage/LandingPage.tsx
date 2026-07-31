import { ArrowRight } from 'lucide-react';
import { loginPage, registerPage } from 'librechat-data-provider';
import { Link } from 'react-router-dom';
import { useAuthContext, useLocalize } from '~/hooks';
import './LandingPage.css';

export default function LandingPage() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();

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
              <a href={loginPage()}>{localize('com_auth_login')}</a>
            )}
            <a className="rekky-landing-nav-cta" href="#get-the-app">
              {localize('com_landing_get_app')}
            </a>
          </div>
        </nav>
      </header>

      <main id="landing-main">
        <section className="rekky-landing-photo-hero" aria-labelledby="landing-title">
          <picture className="rekky-landing-hero-media">
            <source
              srcSet="/assets/landing/eggplant-table-960.webp 960w, /assets/landing/eggplant-table-1600.webp 1586w"
              sizes="100vw"
              type="image/webp"
            />
            <img
              src="/assets/landing/eggplant-table-1600.webp"
              width="1586"
              height="992"
              loading="eager"
              alt={localize('com_landing_hero_image_alt')}
            />
          </picture>
          <div className="rekky-landing-hero-copy">
            <h1 id="landing-title">{localize('com_landing_title')}</h1>
            <p>{localize('com_landing_lede')}</p>

            <Link className="rekky-landing-text-link" to="/cook">
              {localize('com_landing_no_link')}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
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
            <figure className="rekky-landing-product-proof">
              <img
                src="/assets/landing/rekky-mobile-recipe.webp"
                width="842"
                height="1869"
                loading="lazy"
                alt={localize('com_landing_mobile_canvas_alt')}
              />
              <figcaption>
                <strong>{localize('com_landing_mobile_canvas_caption')}</strong>
                <span>{localize('com_landing_mobile_canvas_detail')}</span>
              </figcaption>
            </figure>
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
          <div className="rekky-landing-close-actions">
            <a href={registerPage()}>
              {localize('com_landing_close_action')}
              <ArrowRight size={20} aria-hidden="true" />
            </a>
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
