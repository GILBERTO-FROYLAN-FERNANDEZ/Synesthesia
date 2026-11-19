import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StudioLandingScreen } from '../../src/screens/Studio/StudioLandingScreen';

describe('Studio landing', () => {
  it('offers real entry workflows without creating a composition on arrival', () => {
    const html = renderToStaticMarkup(createElement(StudioLandingScreen));
    expect(html).toContain('Studio');
    expect(html).toContain('New Composition');
    expect(html).toContain('Use Sample');
    expect(html).toContain('Import File');
    expect(html).toContain('Opening Studio');
  });
});
