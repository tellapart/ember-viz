import Ember from 'ember';

// var MILLISECONDS_IN_MINUTE = 60000;
// var MILLISECONDS_IN_DAY = MILLISECONDS_IN_MINUTE * 60 * 24;
var SEE_DOCUMENTATION_MSG = 'See https://github.com/tellapart/ember-viz for' +
  ' EmberViz usage details.';

export function getAverageGranularity(data) {
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

export function createClassNameFunction(className) {
  return function(d) {
    var classNames = Ember.get(d, 'classNames');
    if (Ember.isNone(classNames)) {
      return className;
    }
    return className + ' ' + classNames;
  };
}

export function getDomain(seriesArray, accessFunction) {
  var enabledSeries = Ember.A(seriesArray).rejectBy('disabled');
  var minValue = d3.min(enabledSeries,
                    function(d) {
                      return d3.min(d.values, accessFunction);
                    }),
      maxValue = d3.max(enabledSeries,
                    function(d) {
                      return d3.max(d.values, accessFunction);
                    });
  return [minValue, maxValue];
}

export function overrideDomain(range, newRange, includeZero) {
  // if (newRange !== undefined && newRange !== null) {
  if (!Ember.isNone(newRange)) {
    if (!isNaN(newRange[0])) {
      range[0] = newRange[0];
    }
    if (!isNaN(newRange[1])) {
      range[1] = newRange[1];
    }
  }
  if (includeZero) {
    if (range[0] < 0 && range[1] < 0) {
      range[1] = 0;
    }
    if (range[0] > 0 && range[1] > 0) {
      range[0] = 0;
    }
  }

  // Override the values when they are undefined, to prevent d3 errors.
  if (Ember.isNone(range[0])) {
    range[0] = 0;
  }
  if (Ember.isNone(range[1])) {
    range[1] = 0;
  }
  return range;
}

export function sanitizeDataArray(data, getX, getY) {
  if (!(data instanceof Array)) {
    throw 'The "data" attribute is not an array.';
  }

  return data.map(function(series) {
    var sanitizedValues,
        values = Ember.get(series, 'values');

    if (Ember.isEmpty(values)) {
      values = Ember.A([]);
    }

    sanitizedValues = values.map(function(elem) {
      var x,
          y,
          xError = 'Could not extract a valid datapoint using' +
            ' the supplied "getX" function. ' + SEE_DOCUMENTATION_MSG,
          yError = 'Could not extract a valid datapoint using' +
            ' the supplied "getY" function. ' + SEE_DOCUMENTATION_MSG;

      // Use the getX and getY functions to extract the x and y values from
      // each datapoint.
      try {
        x = getX(elem);
      } catch (e) {
        throw xError;
      }
      try {
        y = getY(elem);
      } catch (e) {
        throw yError;
      }

      // Verify that the extracted values are actually numbers.
      if (isNaN(x)) {
        throw xError;
      }
      if (isNaN(y)) {
        throw yError;
      }

      return {
        x: x,
        y: y,
        original: elem
      };
    });
    var sortedValues = sanitizedValues.sort(function(a, b) {
      return a.x - b.x;
    });

    return Ember.Object.create({
      type: Ember.get(series, 'type'),
      classNames: Ember.get(series, 'classNames'),
      color: Ember.get(series, 'color'),
      disabled: Ember.get(series, 'disabled') ? true : false,
      title: Ember.get(series, 'title'),
      values: sortedValues,
    });

  });
}
