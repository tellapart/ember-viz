import Ember from 'ember';

var DEFAULT_FORMATTER = d3.format;
var DEFAULT_FORMAT = '';
export function evFormatNumber(input, options) {
  var formatter = options.hash.formatter || DEFAULT_FORMATTER;
  var format = options.hash.format || DEFAULT_FORMAT;

  if (Ember.isNone(input)) {
    return '';
  }

  try {
    return formatter(format)(input);
  } catch(e) {
    return '';
  }
};

export default Ember.Handlebars.makeBoundHelper(evFormatNumber);
