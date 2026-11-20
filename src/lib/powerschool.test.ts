import { describe, it, expect } from 'vitest';
import { splitScoreAndNote, classifyLoginAlert } from './powerschool';

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

describe('classifyLoginAlert', () => {
  it('treats a bad-credentials message on the login form as rejected', () => {
    expect(classifyLoginAlert('Invalid Username or Password!', true)).toBe('rejected');
  });

  it('treats lockouts and throttling as blocked, not a bad password', () => {
    expect(classifyLoginAlert('Account locked: too many invalid attempts', true)).toBe('blocked');
    expect(classifyLoginAlert('Please try again later', true)).toBe('blocked');
  });

  it('treats an unrecognised message on the login form as blocked', () => {
    expect(classifyLoginAlert('Something odd happened', true)).toBe('blocked');
  });

  it('ignores alerts once the login form is gone (signed in)', () => {
    expect(classifyLoginAlert('Invalid fee balance notice', false)).toBe('ok');
  });

  it('is ok when there is no alert text', () => {
    expect(classifyLoginAlert('', true)).toBe('ok');
  });
});
