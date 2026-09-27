import { describe, it, expect } from 'vitest';
import { splitScoreAndNote } from './powerschool';

describe('splitScoreAndNote', () => {
  it('splits a fraction score from trailing teacher comment text', () => {
    expect(splitScoreAndNote('18/20 Great improvement, see me for extra credit')).toEqual({
      score: '18/20',
      note: 'Great improvement, see me for extra credit',
    });
  });

  it('splits a percent score with a leading separator on the note', () => {
    expect(splitScoreAndNote('95% - talk to me after class')).toEqual({
      score: '95%',
      note: 'talk to me after class',
    });
  });

  it('splits a letter grade from a note', () => {
    expect(splitScoreAndNote('A- nice work')).toEqual({ score: 'A-', note: 'nice work' });
  });

  it('splits a bare points score with no separator before the note', () => {
    expect(splitScoreAndNote('18Missing the conclusion paragraph')).toEqual({
      score: '18',
      note: 'Missing the conclusion paragraph',
    });
  });

  it('leaves a bare score with no trailing text alone', () => {
    expect(splitScoreAndNote('18/20')).toEqual({ score: '18/20', note: '' });
  });

  it('falls back to the raw text as the score when nothing recognizable leads it', () => {
    expect(splitScoreAndNote('Late')).toEqual({ score: 'Late', note: '' });
  });

  it('handles empty input', () => {
    expect(splitScoreAndNote('')).toEqual({ score: '', note: '' });
  });
});
