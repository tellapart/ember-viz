import Ember from 'ember';

var MILLISECONDS_IN_MINUTE = 60000;
var MILLISECONDS_IN_DAY = MILLISECONDS_IN_MINUTE * 60 * 24;

function _getAverageGranularity(data) {
  if (Ember.isEmpty(data)) {
    return 0;
  }

  var count = 0;
  var total = 0;
  data.forEach(function(series) {
    var valuesLength = Ember.get(series, 'values.length');
    for (var i = 1; i < valuesLength; i++) {
      var x0 = series.values[i - 1].x;
      var x1 = series.values[i].x;

      count++;
      total += x1 - x0;
    }
  });
  return total / count;
}

export function defaultTimeFormatter(data) {
  let avgGranularity = _getAverageGranularity(data),
              format = '';

  // If the average granularity is around or greater than one point per day,
  // only show month and date.
  if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
    format = '%m/%d';
  // If the average granularity is less than a minute, show the month, date,
  // hour, minute, and second.
  } else if (avgGranularity <= MILLISECONDS_IN_MINUTE) {
    format = '%m/%d %H:%M:%S';
  } else {
    format = '%m/%d %H:%M';
  }

  return d3.time.format.utc(format);
}

export var defaultValueFormatter = d3.format();
