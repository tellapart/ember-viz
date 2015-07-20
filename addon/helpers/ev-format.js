import Ember from 'ember';

export function evFormat([input], {formatter, format, inputTransform}) {
  if (Ember.isNone(input)) {
    return '';
  }

  try {
    return formatter(format)(inputTransform(input));
  } catch(e) {
    return '';
  }
}
export default Ember.HTMLBars.makeBoundHelper(evFormat);
