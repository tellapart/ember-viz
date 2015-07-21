import Ember from 'ember';

export function evFormat([input], {formatter}) {
  if (Ember.isNone(input)) {
    return '';
  }

  try {
    return formatter(input);
  } catch(e) {
    return '';
  }
}
export default Ember.HTMLBars.makeBoundHelper(evFormat);
