import { describe, expect, it } from 'vitest';
import { primaryForPath } from '../../src/app/GlobalNavigation';

describe('global navigation', () => {
  it('maps workspace routes to their primary destination', () => {
    expect(primaryForPath('/studio/abc')).toBe('studio');
    expect(primaryForPath('/studio/new/signature')).toBe('studio');
    expect(primaryForPath('/studio')).toBe('studio');
    expect(primaryForPath('/perform')).toBe('perform');
    expect(primaryForPath('/perform/live')).toBe('perform');
    expect(primaryForPath('/perform/review')).toBe('perform');
    expect(primaryForPath('/performance/asset/abc')).toBe('perform');
    expect(primaryForPath('/collaborative')).toBe('collaborate');
    expect(primaryForPath('/collaborative/abc')).toBe('collaborate');
  });

  it('keeps Library workflows grouped and secondary pages unselected', () => {
    expect(primaryForPath('/')).toBe('library');
    expect(primaryForPath('/prepare')).toBe('library');
    expect(primaryForPath('/signature/abc')).toBe('library');
    expect(primaryForPath('/album/abc')).toBe('library');
    expect(primaryForPath('/guide')).toBe(null);
    expect(primaryForPath('/settings')).toBe(null);
  });
});
