import BaseComponent from 'ember-viz/components/base-component';
import ChartSettings from 'ember-viz/mixins/chart-settings';
import {createClassNameFunction, getDomain, sanitizeDataArray} from 'ember-viz/utils/misc';
import Ember from 'ember';

export default BaseComponent.extend(ChartSettings, {
  tagName: 'svg',
  classNames: ['ev-context-chart'],
  lineType: d3.svg.line,

  clipPathId: Ember.computed('elementId', function() {
    return this.get('elementId') + '-clip-path';
  }),

  colorFn: Ember.computed(function() {
    var colors = d3.scale.category20().range();
    return function(d, i) { return d.color || colors[i % colors.length]; };
  }),

  line: Ember.computed('lineType', 'xScale', 'yScale', function() {
    var xScale = this.get('xScale'),
        yScale = this.get('yScale');
    return this.get('lineType')()
      .x(function(d) { return xScale(d.x); })
      .y(function(d) { return yScale(d.y); });
  }),

  lineFn: Ember.computed('line', function() {
    var line = this.get('line');
    return function(d) {
      if (Ember.get(d, 'disabled')) {
        return line([]);
      } else {
        return line(Ember.get(d, 'values'));
      }
    };
  }),

  _dataWithoutPoints: Ember.computed('data.[]', function() {

    try {
      return sanitizeDataArray(this.get('data'), this.get('getX'), this.get('getY'));
    } catch(e) {
      console.error(e);
      return [];
    }
  }),
  _data: Ember.computed('_dataWithoutPoints.[]', 'xScale', 'yScale', function() {
    var xScale = this.get('xScale'),
        yScale = this.get('yScale'),
        xCache = {};

    return this.get('_dataWithoutPoints').map(function(series) {
      var newValues,
          values = series.get('values');

      newValues = values.map(function(elem) {
        var xPx = xCache[elem.x];

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

      return Ember.Object.create({
        classNames: series.get('classNames'),
        color: series.get('color'),
        disabled: series.get('disabled'),
        title: series.get('title'),
        values: newValues
      });
    });
  }),

  xDomain: Ember.computed('_dataWithoutPoints.[]', 'showContext', 'brushExtent',
    'forceX', function() {
    // console.log('xDomain()', arguments[1]);
    return getDomain(this.get('_dataWithoutPoints'), function(d) { return d.x; });
  }),
  yDomain: Ember.computed('_dataWithoutPoints.[]', '_data.@each.disabled',
    'showContext', 'brushExtent', 'forceY', 'includeZero', function() {
    // console.log('yDomain()', arguments[1]);
    return getDomain(this.get('_dataWithoutPoints'), function(d) { return d.y; });
  }),
  xScale: Ember.computed('xDomain', '_mainRectWidth', function() {
    // console.log('xScale()', arguments[1]);
    return d3.time.scale.utc().domain(this.get('xDomain')).range([0, this.get('_mainRectWidth')]);
  }),
  yScale: Ember.computed('yDomain', '_mainRectHeight', function() {
    // console.log('yScale()', arguments[1]);
    return d3.scale.linear().domain(this.get('yDomain')).range([this.get('_mainRectHeight'), 0]);
  }),
  xAxis: Ember.computed('xScale', '_timeTickFormatFn', function() {
    return d3.svg.axis()
      .orient('bottom')
      .ticks(this.get('xGridTicks'))
      .scale(this.get('xScale'))
      .tickFormat(this.get('_timeTickFormatFn'));
  }),

  _mainRectHeight: Ember.computed('contextHeight',
    'contextMargins.{top,bottom}', function() {
    var margins = this.get('contextMargins');
    return Math.max(this.get('contextHeight') - margins.get('top') - margins.get('bottom'), 0);
  }),

  _mainRectWidth: Ember.computed('contextWidth', 'contextMargins.{left,right}',
    function() {
    var margins = this.get('contextMargins');
    return Math.max(this.get('contextWidth') - margins.get('right') - margins.get('left'), 0);
  }),
  didInsertElement: function() {
    window.context = this;

    var g = this.d3()
     .append('g')
      .attr('class', 'ev-main');

    // Add the x-axis.
    g.append('g')
      .attr('class', 'ev-axis context-x-axis');

    // Add the main element for chart lines.
    g.append('g')
      .attr('class', 'ev-context-chart-lines');

    // Add the brush elements.
    var brushMain = g.append('g')
      .attr('class', 'ev-brush');

    // Need to add the brush background first.
    var brushBackground = brushMain.append('g')
      .attr('class', 'ev-context-brush-background');
    brushBackground.append('rect')
      .attr('class', 'right')
      .attr('x', 0)
      .attr('y', 0);
    brushBackground.append('rect')
      .attr('class', 'left')
      .attr('x', 0)
      .attr('y', 0);

    // Add the brush.
    brushMain.append('g')
      .attr('class', 'ev-context-brush');

    this._render();

    this._updateMainRect();
    this._updateContextAxes();
    this._updateChartLines();
    this._updateBrush();
  },

  brush: Ember.computed('xScale', 'xDomain', 'brushExtent', function() {
    var brush,
        self = this,
        brushExtent = this.get('brushExtent'),
        xDomain = this.get('xDomain');

    function onBrush() {
      brushExtent = brush.empty() ? null : brush.extent();
      self.set('brushExtent', brushExtent);
    }

    brush = d3.svg.brush()
      .x(this.get('xScale'))
      .on('brush', onBrush);

    if (brushExtent) {
      // Make sure the existing brushExtent fits inside the actual domain
      //  from the data.
      if (brushExtent[0] < xDomain[0]) {
        brushExtent[0] = xDomain[0];
      }
      if (brushExtent[1] > xDomain[1]) {
        brushExtent[1] = xDomain[1];
      }
      brush.extent(brushExtent);
    }
    return brush;
  }),

  _updateBrush: Ember.observer('_mainRectHeight', '_mainRectWidth',
    'contextMargins.top', 'brush', 'xScale', 'yScale', function() {
    // console.log('context _updateBrush()', arguments[1]);
    this.d3('.ev-brush');
    var gBrush = this.d3('.ev-context-brush'),
        _mainRectHeight = this.get('_mainRectHeight');

    // Taken from crossfilter (http://square.github.com/crossfilter/)
    function resizePath(d) {
      var e = +(d === 'e'),
          x = e ? 1 : -1,
          y = _mainRectHeight / 3;
      return 'M' + (0.5 * x) + ',' + y +
        'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6) +
        'V' + (2 * y - 6) +
        'A6,6 0 0 ' + e + ' ' + (0.5 * x) + ',' + (2 * y) +
        'Z'+
        'M' + (2.5 * x) + ',' + (y + 8) +
        'V' + (2 * y - 8) +
        'M' + (4.5 * x) + ',' + (y + 8) +
        'V' + (2 * y - 8);
    }

    gBrush.call(this.get('brush'));
    gBrush.selectAll('rect')
      .attr('height', _mainRectHeight);

    gBrush.selectAll('.resize').append('path').attr('d', resizePath);


    // Adjust the heights of the background rects.
    this.d3('.ev-context-brush-background').selectAll('rect')
      .attr('height', this.get('_mainRectHeight'));

    var xScale = this.get('xScale'),
        brushExtent = this.get('brushExtent');

    var domain = this.get('brush').empty() ? xScale.domain() : brushExtent;
    var leftWidth = xScale(domain[0]) - xScale.range()[0],
        rightWidth = xScale.range()[1] - xScale(domain[1]);

    this.d3('.ev-context-brush-background .left')
      .attr('height', this.get('_mainRectHeight'))
      .attr('width', leftWidth < 0 ? 0 : leftWidth);

    this.d3('.ev-context-brush-background .right')
      .attr('height', this.get('_mainRectHeight'))
      .attr('width', rightWidth < 0 ? 0 : rightWidth)
      .attr('x', xScale(domain[1]));
  }),

  _updateChartLines: Ember.observer('_data.[]', 'lineFn', function() {
    var colorFn = this.get('colorFn');
    var elements = this.d3('.ev-context-chart-lines')
      .selectAll('.ev-context-chart-line')
      .data(this.get('_data'));

    // Add the new chart lines.
    elements.enter()
      .append('path')
      .attr('class', createClassNameFunction('ev-context-chart-line'))
      .attr('clip-path', 'url(#' + this.get('clipPathId') + ')')
      .attr('d', this.get('lineFn'))
      .style('stroke', colorFn);

    elements.exit()
      .remove();

    // Update the existing lines.
    this.d3All('.ev-context-chart-line')
      .attr('d', this.get('lineFn'))
      .style('stroke', colorFn);

  }),

  _updateMainRect: Ember.observer('contextMargins.{left,right}', function() {
    // console.log('_updateMainRect()', arguments[1]);
    var margins = this.get('contextMargins');
    this.d3('.ev-main')
      .attr('transform',
            'translate(' + margins.get('left') + ',' + margins.get('top') + ')');
  }),

  _updateContextAxes: Ember.observer('xAxis', function() {
    this.d3('.context-x-axis')
       .attr('transform', 'translate(0,' + this.get('_mainRectHeight') + ')')
       .call(this.get('xAxis'));
  }),
  _render: Ember.observer('contextHeight', 'contextWidth', '_data.[]', function() {
    // console.log('context chart - _render()');
    this.d3()
      .attr('width', this.get('contextWidth'))
      .attr('height', this.get('contextHeight'));

    // if (Ember.isEmpty(this.get('_data'))) {
    //   this._addNoDataBox();
    //   return;
    // }

  }),
});
