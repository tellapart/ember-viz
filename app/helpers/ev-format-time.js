import Ember from 'ember';

var DEFAULT_TIME_FORMATTER = d3.time.format.utc;

export function evFormatTime(input, options) {
  var formatter = options.hash.formatter || DEFAULT_TIME_FORMATTER;
  var format = options.hash.format || '%m/%d';

  if (Ember.isNone(input)) {
    return '';
  }

  try {
    return formatter(format)(new Date(input));
  } catch(e) {
    return '';
  }
};

export default Ember.Handlebars.makeBoundHelper(evFormatTime);
