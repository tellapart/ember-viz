import BaseComponent from 'ember-viz/components/base-component';
import ChartSettings from 'ember-viz/mixins/chart-settings';
import {createClassNameFunction} from 'ember-viz/utils/misc';
import Ember from 'ember';

let EVIZ_CHARTS_CLASS = 'ev-charts';

export default BaseComponent.extend(ChartSettings, {
  tagName: 'svg',
  classNames: ['ev-main-svg'],

  _clipPathId: Ember.computed('elementId', function() {
    return this.get('elementId') + '-clip-path';
  }),

  _watchBrushExtent: Ember.observer('brushExtent', function() {
    // Remove the tooltip whenever the brushExtent changes.
    this.set('selectedPoint', null);
  }),

  _findClosestPoint: function(data, xPosition, yPosition) {
    var closestPoint,
        seriesTitle,
        curDistSq,
        xDist,
        yDist,
        searchRadius = this.get('pointSearchRadius'),

        // Initialize the "closest" point to one unit past the furthest
        // possible point that is still inside the bounding box.
        minDistSq = 2 * (searchRadius) * (searchRadius) + 1;

    // TODO: Use binary search algorithm to make more efficient.
    data.forEach(function(series) {

      if (series.get('disabled')) {
        return;
      }

      series.values.forEach(function(elem) {

        // Check that the x value is within range.
        xDist = elem.xPx - xPosition;
        if (xDist > searchRadius || xDist < -1 * searchRadius) {
          return;
        }

        // Check that the y value is within range.
        yDist = elem.yPx - yPosition;
        if (yDist > searchRadius || yDist < -1 * searchRadius) {
          return;
        }

        // Check if the proxy distance (distance squared, so as to avoid
        // unnecessary computation time for the square root) is closer than
        // the closest existing point.
        curDistSq = xDist * xDist + yDist * yDist;
        if (curDistSq < minDistSq) {
          closestPoint = elem;
          seriesTitle = Ember.get(series, 'title');
          minDistSq = curDistSq;
        }
      });
    });
    if (Ember.isNone(closestPoint)) {
      return null;
    }
    return {
      point: closestPoint,
      seriesTitle: seriesTitle
    };
  },

  xGrid: Ember.computed('xScale', '_mainRectHeight', function() {
    return d3.svg.axis().orient('bottom').ticks(this.get('xGridTicks')).tickFormat('').scale(this.get('xScale'))
      .tickSize(-1 * this.get('_mainRectHeight'), 0, 0);
  }),
  yGrid: Ember.computed('yScale', '_mainRectWidth', function() {
    return d3.svg.axis().orient('left').ticks(this.get('yGridTicks')).tickFormat('').scale(this.get('yScale'))
      .tickSize(-1 * this.get('_mainRectWidth'), 0, 0);
  }),
  xAxis: Ember.computed('xScale', '_xTickFormatFn', function() {
    return d3.svg.axis()
      .orient('bottom')
      .ticks(this.get('xGridTicks'))
      .scale(this.get('xScale'))
      .tickFormat(this.get('_xTickFormatFn'));
  }),
  yAxis: Ember.computed('yScale', '_yTickFormatFn', function() {
    return d3.svg.axis()
      .orient('left')
      .ticks(this.get('yGridTicks'))
      .scale(this.get('yScale'))
      .tickFormat(this.get('_yTickFormatFn'));
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

  lineType: d3.svg.line,
  line: Ember.computed('lineType', 'xMap', 'yMap', function() {
    var xMap = this.get('xMap'),
        yMap = this.get('yMap');
    return this.get('lineType')()
      .x(xMap)
      .y(yMap);
  }),

  xMap: Ember.computed('xScale', function() {
    let xScale = this.get('xScale');
    return function(d) {
      return xScale(d.x);
    };
  }),

  yMap: Ember.computed('yScale', function() {
    let yScale = this.get('yScale');
    return function(d) {
      return yScale(d.y);
    };
  }),

  didInsertElement: function() {
    window.main = this;
    this._render();

    // Append the main 'g' element
    var g = this.d3()
     .append('g')
      .attr('class', 'ev-main');

    // Append the x and y grid
    g.append('g')
       .attr('class', 'ev-grid main-y-grid');
    g.append('g')
       .attr('class', 'ev-grid main-x-grid');

    // Append the x and y axes.
    g.append('g')
     .attr('class', 'ev-axis main-x-axis');
    g.append('g')
     .attr('class', 'ev-axis main-y-axis');

    // Append the clip path.
    g.append('defs').append('clipPath')
     .attr('id', this.get('_clipPathId'))
     .append('rect');

    // Append the tooltip circle
    g.append('circle')
      .attr('class', 'ev-tooltip-circle');

    // Append the main chart lines.
    g.append('g')
     .attr('class', EVIZ_CHARTS_CLASS)
     .attr('clip-path', 'url(#' + this.get('_clipPathId') + ')');

    // Append the hover rectangle.
    g.append('rect')
      .attr('class', 'ev-hover-rect');

    // Trigger the first updates of all major chart components.
    this._updateGrid();
    this._updateXAxis();
    this._updateYAxis();
    this._updateMainRect();
    this._updateClipPath();
    this._updateSeries();
    this._updateHoverRect();
    this._updateTooltipCircle();
  },

  _updateHoverRect: Ember.observer('_mainRectHeight', '_mainRectWidth',
    '_handleMouseMove', '_handleMouseClick', '_handleMouseOut', function() {
    this.d3('.ev-hover-rect')
      .attr('width', this.get('_mainRectWidth'))
      .attr('height', this.get('_mainRectHeight'))
      .on('mousemove', this.get('_handleMouseMove'))
      .on('click', this.get('_handleMouseClick'))
      .on('mouseout', this.get('_handleMouseOut'));

  }),

  _handleMouseMove: Ember.computed(function() {
    var self = this;
    return function() {
      var closestPoint,
          position = d3.mouse(this),
          xPos = position[0],
          yPos = position[1];

      closestPoint = self._findClosestPoint(self.get('_data'), xPos, yPos);
      self.set('selectedPoint', closestPoint);
    };
  }),

  _handleMouseClick: Ember.computed(function() {
    // console.log('Handling hover rect click');
    var self = this;
    return function() {
      var clickedPoint,
          position = d3.mouse(this),
          xPos = position[0],
          yPos = position[1];

      clickedPoint = self._findClosestPoint(self.get('_data'), xPos, yPos);
      self.sendAction('onClick', clickedPoint);
    };
  }),
  _handleMouseOut: Ember.computed(function() {
    var self = this;
    return function() {
      self.set('selectedPoint', null);
      console.log('Handling hover rect mouseout');
    };
  }),

  _updateClipPath: Ember.observer('_mainRectHeight', '_mainRectWidth', function() {
    this.d3('#' + this.get('_clipPathId') + ' rect')
      .attr('width', this.get('_mainRectWidth'))
      .attr('height', this.get('_mainRectHeight'));
  }),

  _scatterPlotData: Ember.computed('_data.[]', function() {
    return this.get('_data').filterBy('type', 'scatterPlot');
  }),

  _lineGraphData: Ember.computed('_data.[]', function() {
    return this.get('_data').filterBy('type', 'lineGraph');
  }),

  _updateSeries: Ember.observer('xMap', 'yMap', function() {
    this._updateScatterPlots();
    this._updateLineGraphs();
  }),

  _updateScatterPlots() {
    let colorFn = this.get('colorFn'),
        parent = this.d3(`.${EVIZ_CHARTS_CLASS}`),
        xMap = this.get('xMap'),
        yMap = this.get('yMap'),
        scatterPlotData = this.get('_scatterPlotData');

    let scatterPlots = parent.selectAll('.ev-scatter-plot')
      .data(scatterPlotData);

    // Add the scatter plots
    scatterPlots.enter()
      .append('g')
      .attr('class', createClassNameFunction('ev-scatter-plot'))
      .style('fill', colorFn);

    scatterPlots.selectAll('circle').remove();

    // Add the points for each scatter plot
    scatterPlots.selectAll('circle')
      .data(function(d) { return d.get('values'); })
      .enter().append('circle')
      .attr('r', 3.5)
      .attr('cx', xMap)
      .attr('cy', yMap);

    // Remove old chart lines.
    scatterPlots.exit()
      .remove();
  },

  _updateLineGraphs: Ember.observer('lineFn', 'colorFn', function() {
    var colorFn = this.get('colorFn'),
        elements = this.d3(`.${EVIZ_CHARTS_CLASS}`);

    // Apply the new data array to the chart lines.
    elements = elements.selectAll('.ev-chart-line')
      .data(this.get('_lineGraphData'));

    // Add the new chart lines.
    elements.enter()
      .append('path')
      .attr('class', createClassNameFunction('ev-chart-line'))
      .attr('d', this.get('lineFn'))
      .style('stroke', colorFn);

    // Remove old chart lines.
    elements.exit()
      .remove();

    // Update the existing lines.
    this.d3All('.ev-chart-line')
      .attr('d', this.get('lineFn'))
      .attr('clip-path', 'url(#' + this.get('_clipPathId') + ')')
      .style('stroke', colorFn);

  }),

  _updateMainRect: Ember.observer('mainMargins.{left,right}', function() {
    // console.log('_updateMainRect()', arguments[1]);
    var margins = this.get('mainMargins');
    this.d3('.ev-main')
      .attr('transform',
            'translate(' + margins.get('left') + ',' + margins.get('top') + ')');
  }),

  _updateGrid: Ember.observer('yGrid', 'xGrid', function() {
    // console.log('_updateGrid()', arguments[1]);
    this.d3('.main-y-grid')
       .call(this.get('yGrid'));

    this.d3('.main-x-grid')
       .attr('transform', 'translate(0,' + Math.floor(this.get('_mainRectHeight')) + ')')
       .call(this.get('xGrid'));
  }),

  _updateYAxis: Ember.observer('yAxis', function() {
    // console.log('_updateAxes()', arguments[1]);
    this.d3('.main-y-axis')
       .call(this.get('yAxis'));
  }),

  _updateXAxis: Ember.observer('xAxis', '_mainRectHeight', function() {
    // console.log('_updateAxes()', arguments[1]);

    this.d3('.main-x-axis')
       .attr('transform', 'translate(0,' + Math.floor(this.get('_mainRectHeight')) + ')')
       .call(this.get('xAxis'));
  }),

  _updateTooltipCircle: Ember.observer('_correspondingPoint', function() {
    // Fetch the corresponding point to begin
    var correspondingPoint = this.get('_correspondingPoint'),
        tooltipCircle = this.d3('.ev-tooltip-circle');

    if (!this.get('showTooltip') || Ember.isNone(correspondingPoint)) {
      tooltipCircle.style('display', 'none');
      return;
    }

    tooltipCircle
      .attr('cx', correspondingPoint.point.xPx + 'px')
      .attr('cy', correspondingPoint.point.yPx + 'px')
      .attr('r', 5)
      .style('display', 'inline');

  }),

  _render: Ember.observer('mainHeight', 'mainWidth', '_data.[]', function() {
    // console.log('_render()');
    this.d3()
      .attr('width', this.get('mainWidth'))
      .attr('height', this.get('mainHeight'));

    // if (Ember.isEmpty(this.get('_data'))) {
    //   this._addNoDataBox();
    //   return;
    // }

  }),
});
