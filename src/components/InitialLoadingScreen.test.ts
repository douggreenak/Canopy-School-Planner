import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InitialLoadingScreen from './InitialLoadingScreen';

describe('InitialLoadingScreen', () => {
  it('renders branded, accessible loading content in server HTML', () => {
    const markup = renderToStaticMarkup(createElement(InitialLoadingScreen));

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Canopy');
    expect(markup).toContain('Loading your planner');
    expect(markup).toContain('src="/favicon.svg"');
    expect(markup).toContain('loading="eager"');
  });
});
