import Ember from 'ember';
import {getDomain, overrideDomain, sanitizeDataArray} from 'ember-viz/utils/misc';

export default Ember.Component.extend({
  getX: function(elem) { return Ember.get(elem, 'x'); },
  getY: function(elem) { return Ember.get(elem, 'y'); },
  d3: function(selector) {
    var elementId = this.get('elementId');
    if (Ember.isEmpty(selector)) {
      return d3.select('#' + elementId);
    }

    return d3.select('#' + elementId + ' ' + selector);
  },

  d3All: function(selector) {
    var elementId = this.get('elementId');
    if (Ember.isEmpty(selector)) {
      return d3.selectAll('#' + elementId);
    }

    return d3.selectAll('#' + elementId + ' ' + selector);
  },
  _valueTickFormatFn: Ember.computed('valueTickFormatter', 'valueTickFormat', function() {
    return this.get('valueTickFormatter')(this.get('valueTickFormat'));
  }),

  _timeTickFormatFn: Ember.computed('timeFormatter', 'timeTickFormat', function() {
    return this.get('timeFormatter')(this.get('timeTickFormat'));
  }),
  _dataWithoutPoints: Ember.computed('data.[]', 'data.@each.disabled', function() {
    try {
      return Ember.A(sanitizeDataArray(this.get('data'), this.get('getX'), this.get('getY')));
    } catch(e) {
      console.error(e);
      return Ember.A([]);
    }
  }),

  _data: Ember.computed('_dataWithoutPoints.[]', 'xScale', 'yScale', function() {
    let xCache = {};

    return Ember.A(this.get('_dataWithoutPoints').map((series) => {
      let values = series.get('values');

      return Ember.Object.create({
        type: series.get('type'),
        classNames: series.get('classNames'),
        color: series.get('color'),
        disabled: series.get('disabled'),
        title: series.get('title'),
        values: this._decoratedValues(values, xCache)
      });
    }));
  }),

  /* Take each data value {x, y} and decorate with
   * original point, xPx, and yPx.
   *
   * xPx and yPx refer to the computed pixel locations of these data values
   * These values make it easier to do hover comparisons
   * */
  _decoratedValues: function(values, xCache) {
    let xScale = this.get('xScale'),
        yScale = this.get('yScale');

    return values.map((elem) => {
      let xPx = xCache[elem.x];

      if (Ember.isNone(xPx)) {
        xPx = xScale(elem.x);
        xCache[elem.x] = xPx;
      }

      return {
        x: elem.x,
        xPx: xPx,
        y: elem.y,
        yPx: yScale(elem.y),
        original: elem,
      };
    });
  },

  xDomain: Ember.computed('_dataWithoutPoints.[]', 'showContext', 'brushExtent', 'forceX', function() {
    // console.log('xDomain()', arguments[1]);
    var domain,
        brushExtent = this.get('brushExtent');

    if (!Ember.isNone(brushExtent)) {
      return brushExtent;
    } else {
      domain = getDomain(this.get('_dataWithoutPoints'), function(d) { return d.x; });
      return overrideDomain(domain, this.get('forceX'));
    }
  }),

  yDomain: Ember.computed('_dataWithoutPoints.[]', '_data.@each.disabled',
    'showContext', 'brushExtent', 'forceY', 'includeZero', function() {
    var domain,
        data = this.get('_dataWithoutPoints'),
        brushExtent = this.get('brushExtent');

    // If there is a brushExtent, we should restrict the y domain to the
    // points within the brushExtent timespan.
    if (!Ember.isNone(brushExtent)) {
      var minValue = null,
          maxValue = null,
          enabledSeries = Ember.A(data).rejectBy('disabled');

      enabledSeries.forEach(function(series) {
        series.values.forEach(function(point) {

          if (point.x >= brushExtent[0] && point.x <= brushExtent[1]) {
            if (minValue === null || point.y < minValue) {
              minValue = point.y;
            }
            if (maxValue === null || point.y > maxValue) {
              maxValue = point.y;
            }
          }
        });
      });
      domain = [minValue, maxValue];
    } else {
      domain = getDomain(data, function(d) { return d.y; });
    }
    return overrideDomain(domain, this.get('forceY'),
                          this.get('includeZero'));
  }),
  xScale: Ember.computed('xDomain', '_mainRectWidth', function() {
    // console.log('xScale()', arguments[1]);
    return d3.time.scale.utc().domain(this.get('xDomain')).range([0, this.get('_mainRectWidth')]);
  }),
  yScale: Ember.computed('yDomain', '_mainRectHeight', function() {
    return d3.scale.linear().domain(this.get('yDomain')).range([this.get('_mainRectHeight'), 0]);
  }),

  _mainRectHeight: Ember.computed('mainHeight', 'mainMargins.{top,bottom}', function() {
    var margins = this.get('mainMargins');
    return Math.max(this.get('mainHeight') - margins.get('top') - margins.get('bottom'), 0);
  }),
  _mainRectWidth: Ember.computed('mainWidth', 'mainMargins.{left,right}', function() {
    var margins = this.get('mainMargins');
    return Math.max(this.get('mainWidth') - margins.get('left') - margins.get('right'), 0);
  }),
  // Function to find the point that actually matches the same seriesTitle and
  // x-value for the selectedPoint.
  _correspondingPoint: Ember.computed('selectedPoint', '_data.[]', function() {
    var seriesTitle, matchingSeries, correspondingPoint,
        selected = this.get('selectedPoint'),
        data = this.get('_data');

    if (Ember.isNone(selected)) {
      return null;
    }

    seriesTitle = Ember.get(selected, 'seriesTitle');
    matchingSeries = Ember.A(data).findProperty('title', seriesTitle);

    if (Ember.isNone(matchingSeries)) {
      return null;
    }

    correspondingPoint = Ember.A(matchingSeries.get('values')).findProperty('x', selected.point.x);

    if (Ember.isNone(correspondingPoint)) {
      return null;
    }

    return {
      point: correspondingPoint,
      seriesTitle: seriesTitle
    };

  }),

  colorFn: Ember.computed(function() {
    var colors = d3.scale.category20().range();
    return function(d, i) { return d.color || colors[i % colors.length]; };
  }),
});
