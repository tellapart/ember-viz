(function() {
  Ember.EmberViz = Ember.Namespace.create();
})();

(function() {
  Ember.EmberViz.Helpers = Ember.Namespace.create({
    getRanges: function(seriesArray) {

      var minX = d3.min(seriesArray,
                        function(d) {
                          return d3.min(d.values,
                                        function(v) { return v.x; }); }),
          maxX = d3.max(seriesArray,
                        function(d) {
                          return d3.max(d.values,
                                        function(v) { return v.x; }); }),
          minY = d3.min(seriesArray,
                        function(d) {
                          return d3.min(d.values,
                                        function(v) { return v.y; }); }),
          maxY = d3.max(seriesArray,
                        function(d) {
                          return d3.max(d.values,
                                        function(v) { return v.y; }); });

      return {
        x: [minX, maxX],
        y: [minY, maxY]
      };
    },
    overrideRange: function(range, newRange) {

      if (newRange !== undefined && newRange !== null) {
        if (!isNaN(newRange[0])) {
          range[0] = newRange[0];
        }
        if (!isNaN(newRange[1])) {
          range[1] = newRange[1];
        }
      }
    },
    makeXAxisElement: function(scale, format) {
      return d3.svg.axis()
               .scale(scale)
               .orient('bottom')
               .tickFormat(format)
               .ticks(7);
    },
    makeYAxisElement: function(scale, format) {
      return d3.svg.axis()
               .scale(scale)
               .orient('left')
               .tickFormat(format);
    }

  });
})();

(function() {
  var MILLISECONDS_IN_DAY = 86400000;
  var MILLISECONDS_IN_MINUTE = 60000;

  /*
   * Basic chart view to display a chart with no manipulation of the provided
   * data.
   */
  Ember.EmberViz.LineChartComponent = Ember.Component.extend({

    /***************************************************************************
     * Public variables that can be overwritten.
     **************************************************************************/

    classNames: ['line-chart'],

    // Default options. User can override any or all of them by setting an
    // 'options' attribute upon component creation.
    tooltipSearchRadius: 10,
    margins: {top: 20, right: 20, bottom: 30, left: 50},
    forceY: null,
    forceX: null,
    lineType: d3.svg.line,

    // Normally, the component chooses its size based on the container size, as
    // the CSS formats it. If CSS doesn't specify a size, then these default
    // values are used. To force a specific size, override the 'height' and
    // 'width' attributes or apply CSS height and width styles to the div.
    defaultHeight: 200,
    defaultWidth: 400,

    showTooltip: true,
    timeFormatter: d3.time.format.utc,
    xScale: d3.time.scale.utc(),
    yScale: d3.scale.linear(),
    valueFormatFn: d3.format(''),
    valueTickFormatFn: d3.format('.2s'),

    initialize: function() {
      this.applyUserOptions();
    }.on('init'),

    applyUserOptions: function() {
      var options = this.getWithDefault('options', Ember.Object.create()),
          keys = Ember.keys(options);

      // Iterate through each key in the user-provided options and use them in
      // this chart.
      keys.forEach(function(elem) {
        this.set(elem, options.get(elem));
      }, this);

    }.observes('options'),

    height: function() {
      var elementId = this.get('elementId'),
          $container = $('#' + elementId),
          height = $container.height();

      if (height == 0) {
        // The browser didn't determine a height for the div, so fall back to
        // a default height.
        return this.get('defaultHeight');
      }
      return height;
    }.property(),

    width: function() {
      var elementId = this.get('elementId'),
          $container = $('#' + elementId),
          width = $container.width();

      if (width == 0) {
        // The browser didn't determine a width for the div, so fall back to
        // a default width.
        return this.get('defaultWidth');
      }
      return width;
    }.property(),

    timeFormatFn: function() {
      var _data = this.get('_data'),
          ranges = this._getDataRanges(_data),
          totalTimeRange = ranges.x[1] - ranges.x[0],
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(_data);

      // If the average granularity is around or greater than one point per day,
      // only show month and date.
      if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      if (avgGranularity <= MILLISECONDS_IN_MINUTE) {
        return timeFormatter('%m/%d %H:%M:%S');
      }

      return timeFormatter('%m/%d %H:%M');
    }.property('_data'),

    timeTickFormatFn: function() {
      var _data = this.get('_data'),
          ranges = this._getDataRanges(_data),
          totalTimeRange = ranges.x[1] - ranges.x[0],
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(_data);

      // If the average granularity is around or greater than one point per day,
      // only show month and date.
      if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If more than 5 days are being displayed, only show month and date on the
      // axis labels.
      if (totalTimeRange > 5 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If we're showing more than one day, but still not enough days to get rid
      // of time altogether, show both the date and time.
      if (totalTimeRange > MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d %H:%M');
      }

      // In the scope of less than a day, show the time without the date.
      return timeFormatter('%H:%M');

    }.property('_data'),

    /***************************************************************************
     * Private variables and functions that should not be overwritten.
     **************************************************************************/

    _mainChartHeight: function() {
      var height = this.get('height'),
          margins = this.get('margins');

      return height - margins.top - margins.bottom;
    }.property('height'),

    _mainChartWidth: function() {
      var width = this.get('width'),
          margins = this.get('margins');

      return width - margins.right - margins.left;
    }.property('width'),

    tooltipContentFn: function() {
      var valueFormatFn = this.get('valueFormatFn'),
          timeFormatFn = this.get('timeFormatFn');

      return function(elem, seriesName) {
        return '<h5>' + seriesName + '</h5>' +
               '<hr />' +
               '<p>' + valueFormatFn(elem.y) + ' at ' +
               timeFormatFn(new Date(elem.x)) + '</p>';
      }
    }.property('valueFormatFn', 'timeFormatFn'),

    // Compute the data x and y ranges based on the data and on any forcing
    // values provided by the user.
    _getDataRanges: function(data) {
      var forceY = this.get('forceY'),
          forceX = this.get('forceX'),
          ranges = Ember.EmberViz.Helpers.getRanges(data);

      // If any forceX or forceY were provided, override the ranges derived from
      // from the data.
      Ember.EmberViz.Helpers.overrideRange(ranges.y, forceY);
      Ember.EmberViz.Helpers.overrideRange(ranges.x, forceX);

      return ranges;
    },

    _getAverageGranularity: function(data) {
      var count = 0;
      var total = 0;
      data.forEach(function(series) {
        for (var i = 1; i < series.values.length; i++) {
          var x0 = series.values[i - 1].x;
          var x1 = series.values[i].x;

          count++;
          total += x1 - x0;
        }
      });

      return total / count;
    },

    _colorFn: function() {
      var colors = d3.scale.category20().range();
      return function(d, i) { return d.color || colors[i % colors.length] };
    }.property(),

    _data: function() {
      var data = this.get('data');

      // Make a deep copy of data to avoid manipulating the controller's clean
      // data.
      return Ember.copy(data, true);
    }.property('data.[]'),

    _precomputePoints: function(data, xScale, yScale) {
      var x,
          xCache = {};

      data.forEach(function(series) {

        series.values.forEach(function(elem) {
          x = xCache[elem.x];

          // Cache the scaled timestamps. It's only efficient to store the cached
          // scaling of the timestamp because each timestamp is probably going to
          // be repeated for each series. Y values are not as likely to be
          // repeated.
          if (x == undefined) {
            x = xScale(elem.x);
            xCache[elem.x] = x;
          }

          elem.xPx = x;
          elem.yPx = yScale(elem.y);
        });
      });
    },

    _findClosestPoint: function(data, xPosition, yPosition, maxPixels) {
      var closestPoint,
          seriesName,
          curDistSq,
          xDist,
          yDist,
          searchRadius = this.get('tooltipSearchRadius'),

          // Initialize the "closest" point to one unit past the furthest possible
          // point that is still inside the bounding box.
          minDistSq = 2 * (searchRadius) * (searchRadius) + 1;

      data.forEach(function(series) {

        series.values.forEach(function(elem) {

          // Check that the x value is within range.
          xDist = elem.xPx - xPosition;
          if (xDist > searchRadius || xDist < -1 * searchRadius) return;

          // Check that the y value is within range.
          yDist = elem.yPx - yPosition;
          if (yDist > searchRadius || yDist < -1 * searchRadius) return;

          // Check if the proxy distance (distance squared, so as to avoid
          // unnecessary computation time for the square root) is closer than the
          // closest existing point.
          curDistSq = xDist * xDist + yDist * yDist;
          if (curDistSq < minDistSq) {
            closestPoint = elem;
            seriesName = series.key;
            minDistSq = curDistSq;
          }
        });
      });
      if (!closestPoint) return null;
      return {
        point: closestPoint,
        seriesName: seriesName
      };
    },
    didInsertElement: function() {
      var self = this,
          previousResizeFn = window.onresize;

      this.notifyPropertyChange('height');
      this.notifyPropertyChange('width');
      this._render();

      // Re-render the chart when the window is resized.
      window.onresize = function() {
        self._render();
        if (previousResizeFn !== null) {
          previousResizeFn();
        }
      };
    },
    _render: function() {

      var line,
          svg,
          tooltipCircle,
          xAxis,
          yAxis,
          $tooltipDiv,
          _colorFn = this.get('_colorFn'),
          _data = this.get('_data'),
          _mainChartHeight = this.get('_mainChartHeight'),
          _mainChartWidth = this.get('_mainChartWidth'),

          elementId = this.get('elementId'),
          $container = $('#' + elementId),

          height = this.get('height'),
          width = this.get('width'),

          lineType = this.get('lineType'),
          margins = this.get('margins'),
          ranges = this._getDataRanges(_data),
          self = this,
          showTooltip = this.get('showTooltip'),
          tooltipContentFn = this.get('tooltipContentFn'),
          valueFormatFn = this.get('valueFormatFn'),
          xScale = this.get('xScale'),
          xTickFormat = this.get('timeTickFormatFn'),
          yTickFormat = this.get('valueTickFormatFn'),
          yScale = this.get('yScale');

      // Clear the div.
      $container.empty();

      if (Ember.isEmpty(_data)) {

        // TODO: Show some indication that there is no data.
        return;
      }

      // Apply domain and range to the scales.
      xScale.range([0, _mainChartWidth])
            .domain(ranges.x);

      yScale.range([_mainChartHeight, 0])
            .domain(ranges.y);

      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      svg = d3.select('#' + elementId).append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

      // Create and add the tooltip div.
      $tooltipDiv = $('<div>').addClass('chart-tooltip');
      $container.append($tooltipDiv);

      // Add the x axis.
      xAxis = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat);
      svg.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,' + _mainChartHeight + ')')
          .call(xAxis);

      // Add the y axis.
      yAxis = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat);
      svg.append('g')
          .attr('class', 'y axis')
          .call(yAxis);

      // Add the grid lines.
      svg.append('g')
         .attr('class', 'grid')
         .attr('transform', 'translate(0,' + _mainChartHeight + ')')
         .call(Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat)
                    .tickSize(-1 * _mainChartHeight, 0, 0)
                    .tickFormat('')
         );
      svg.append('g')
         .attr('class', 'grid')
         .call(Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat)
                    .tickSize(-1 * _mainChartWidth, 0, 0)
                    .tickFormat('')
         );

      // Add the chart lines.
      line = lineType()
          .x(function(d) { return xScale(d.x); })
          .y(function(d) { return yScale(d.y); });

      svg.selectAll('.chart-line')
         .data(_data)
       .enter()
         .append('path')
         .attr('class', 'chart-line')
         .attr('d', function(d) { return line(d.values); })
         .style('stroke', _colorFn);

      if (showTooltip) {
        // Add a circle for use with the tooltip.
        tooltipCircle = svg.append('circle')
                           .attr('class', 'tooltip-circle')
                           .attr('cx', 0)
                           .attr('cy', 0)
                           .attr('r', 5);

        // Add an invisible rectangle to detect mouse movements.
        svg.append('rect')
           .attr('width', _mainChartWidth)
           .attr('height', _mainChartHeight)
           .style('opacity', 0)
           .on('mousemove', function() {

             var html,
                 newLeft,
                 newTop,
                 closestPoint,
                 position = d3.mouse(this),
                 xPosition = position[0],
                 yPosition = position[1],
                 closestPointInfo = self._findClosestPoint(_data, xPosition, yPosition);

             // If a closest point was found inside the appropriate radius,
             // display information about that point.
             if (closestPointInfo) {
               closestPoint = closestPointInfo.point;
               newLeft = margins.left + closestPoint.xPx;
               newTop = margins.top + closestPoint.yPx - $tooltipDiv.height() - 10;
               html = tooltipContentFn(closestPoint, closestPointInfo.seriesName);

               // Move the tooltip div near the closest point.
               $tooltipDiv.html(html)
                         .css('display', 'inline')
                         .css('left', newLeft)
                         .css('top', newTop);

               // Position the tooltipCircle around the closest point.
               tooltipCircle.style('display', 'inline')
                            .attr('cx', closestPoint.xPx + 'px')
                            .attr('cy', closestPoint.yPx + 'px');
             } else {
               // Hide the tooltip
               $tooltipDiv.css('display', 'none');
               tooltipCircle.style('display', 'none');
             }
           })

           // Hide the tooltip when the mouse leaves the hover rectangle.
           .on('mouseout', function() {
             $tooltipDiv.css('display', 'none');
             tooltipCircle.style('display', 'none');
           });


        // Precompute the pixel locations of all the points, but only after the
        // rest  of the chart is rendered.
        this._precomputePoints(_data, xScale, yScale);
      }

      // TODO: Allow the developer to bind event handlers. (onclick, etc.)
    }.observes('_data')
  });

  Ember.Handlebars.helper('line-chart', Ember.EmberViz.LineChartComponent);
}) ();

$(function() {
  Ember.EmberViz.LineWithFocusChartComponent = Ember.EmberViz.LineChartComponent.extend({
    classNames: ['line-with-focus-chart'],
    x2Scale: d3.time.scale.utc(),
    y2Scale: d3.scale.linear(),
    focusHeightRatio: 0.25,
    focusHeight: function() {
      var focusHeightRatio = this.get('focusHeightRatio'),
          height = this.get('height');
      return focusHeightRatio * height;
    }.property('height', 'focusHeightRatio'),

    _focusChartHeight: function() {
      var focusHeight = this.get('focusHeight'),
          margins = this.get('margins');
      return focusHeight - margins.bottom - margins.top;
    }.property('focusHeight'),

    // Override this height to accommodate space for the focus chart.
    _mainChartHeight: function() {
      var height = this.get('height'),
          focusHeight = this.get('focusHeight'),
          margins = this.get('margins');

      return height - focusHeight - margins.top - margins.bottom;
    }.property('height', 'focusHeight', 'margins'),

    _renderMainChart: function(data) {
      console.time('Rendering main chart');
      var xAxis,
          yAxis,
          self = this,
          ranges = this._getDataRanges(data),
          elementId = this.get('elementId'),
          g = d3.select('#' + elementId + ' .ember-viz-chart'),
          _colorFn = this.get('_colorFn'),
          _mainChartHeight = this.get('_mainChartHeight'),
          _mainChartWidth = this.get('_mainChartWidth'),
          margins = this.get('margins'),
          xScale = this.get('xScale'),
          yScale = this.get('yScale'),
          lineType = this.get('lineType'),
          showTooltip = this.get('showTooltip'),
          $tooltipDiv = $('#' + elementId + ' .chart-tooltip'),
          tooltipContentFn = this.get('tooltipContentFn'),
          xTickFormat = this.get('timeTickFormatFn'),
          yTickFormat = this.get('valueTickFormatFn');

      console.log('Ranges:', ranges);
      // Apply domain and range to the scales.
      xScale.range([0, _mainChartWidth])
            .domain(ranges.x);

      yScale.range([_mainChartHeight, 0])
            .domain(ranges.y);

      // Add the axes.
      xAxis = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat);
      g.select('.main-x-axis')
        .attr('transform', 'translate(0,' + _mainChartHeight + ')')
        .call(xAxis);

      yAxis = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat);
      g.select('.main-y-axis')
        .call(yAxis);

      // Add the grid lines.
      g.select('.main-x-grid')
       .attr('transform', 'translate(0,' + _mainChartHeight + ')')
       .call(Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat)
                  .tickSize(-1 * _mainChartHeight, 0, 0)
                  .tickFormat('')
       );
      g.select('.main-y-grid')
       .call(Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat)
                  .tickSize(-1 * _mainChartWidth, 0, 0)
                  .tickFormat('')
       );

      // Add the chart lines.
      line = lineType()
          .x(function(d) { return xScale(d.x); })
          .y(function(d) { return yScale(d.y); });

      // g.select('.chart-lines')
      //  .selectAll('.chart-line')
      //  .datum(data)
      //   .append('path')
      //   .attr('class', 'chart-line')
      //   .attr('d', function(d) { return line(d.values); })
      //   .style('stroke', _colorFn);

      g.select('.chart-lines')
       .selectAll('.chart-line')
       .data(data)
       .enter()
        .append('path')
        .attr('class', 'chart-line')
        .attr('d', function(d) { return line(d.values); })
        .style('stroke', _colorFn);

      window.awesome = g;

      if (showTooltip) {
        // Add a circle for use with the tooltip.
        tooltipCircle = g.select('.tooltip-circle')
                          .attr('cx', 0)
                          .attr('cy', 0)
                          .attr('r', 5);

        // Add an invisible rectangle to detect mouse movements.
        g.select('.hover-rect')
         .attr('width', _mainChartWidth)
         .attr('height', _mainChartHeight)
         .style('opacity', 0)
         .on('mousemove', function() {

           var html,
               newLeft,
               newTop,
               closestPoint,
               position = d3.mouse(this),
               xPosition = position[0],
               yPosition = position[1],
               closestPointInfo = self._findClosestPoint(data, xPosition, yPosition);

           // If a closest point was found inside the appropriate radius,
           // display information about that point.
           if (closestPointInfo) {
             closestPoint = closestPointInfo.point;
             newLeft = margins.left + closestPoint.xPx;
             newTop = margins.top + closestPoint.yPx - $tooltipDiv.height() - 10;
             html = tooltipContentFn(closestPoint, closestPointInfo.seriesName);

             // Move the tooltip div near the closest point.
             $tooltipDiv.html(html)
                       .css('display', 'inline')
                       .css('left', newLeft)
                       .css('top', newTop);

             // Position the tooltipCircle around the closest point.
             tooltipCircle.style('display', 'inline')
                          .attr('cx', closestPoint.xPx + 'px')
                          .attr('cy', closestPoint.yPx + 'px');
           } else {
             // Hide the tooltip
             $tooltipDiv.css('display', 'none');
             tooltipCircle.style('display', 'none');
           }
         })

         // Hide the tooltip when the mouse leaves the hover rectangle.
         .on('mouseout', function() {
           $tooltipDiv.css('display', 'none');
           tooltipCircle.style('display', 'none');
         });


        // Precompute the pixel locations of all the points, but only after the
        // rest  of the chart is rendered.
        this._precomputePoints(data, xScale, yScale);
      }

      console.timeEnd('Rendering main chart');
    },

    _renderFocusChart: function(data) {
      var x2Scale = this.get('x2Scale'),
          y2Scale = this.get('y2Scale'),
          ranges = this._getDataRanges(data),
          lineType = this.get('lineType'),
          _focusChartHeight = this.get('_focusChartHeight'),
          _mainChartWidth = this.get('_mainChartWidth'),
          elementId = this.get('elementId'),
          g = d3.select('#' + elementId + ' .ember-viz-chart'),
          _colorFn = this.get('_colorFn'),
          _mainChartHeight = this.get('_mainChartHeight'),
          margins = this.get('margins'),
          xTickFormat = this.get('timeTickFormatFn'),
          yTickFormat = this.get('valueTickFormatFn');

      // Apply the domain and range to the scales.
      x2Scale.range([0, _mainChartWidth])
            .domain(ranges.x);
      y2Scale.range([_focusChartHeight, 0])
            .domain(ranges.y);
      // Add the x axes.
      x2Axis = Ember.EmberViz.Helpers.makeXAxisElement(x2Scale, xTickFormat);
      g.append('g')
        .attr('class', 'x2 axis')
        .attr('transform',
              'translate(0,' + (_mainChartHeight + _focusChartHeight +
                                margins.bottom) + ')')
        .call(x2Axis);

      // Add the y axes.
      y2Axis = Ember.EmberViz.Helpers.makeYAxisElement(y2Scale, yTickFormat)
        .ticks(3);
      g.append('g')
        .attr('class', 'y axis')
        .attr('transform',
              'translate(0,' + (_mainChartHeight + margins.bottom) + ')')
        .call(y2Axis);

      // Add the grid lines.
      $('#' + elementId + ' .focus-x-grid').remove();
      $('#' + elementId + ' .focus-y-grid').remove();
      // g.select('.focus-x-grid')
      g.append('g')
       .attr('class', 'focus-x-grid')
       .attr('class', 'grid')
       .attr('transform',
             'translate(0,' + (_focusChartHeight + _mainChartHeight +
                               margins.bottom) + ')')
       .call(Ember.EmberViz.Helpers.makeXAxisElement(x2Scale, xTickFormat)
                  .tickSize(-1 * _focusChartHeight, 0, 0)
                  .tickFormat('')
       );
      // g.select('.focus-y-grid')
      g.append('g')
       .attr('class', 'focus-y-grid')
       .attr('class', 'grid')
       .attr('transform', 'translate(0,' + (_mainChartHeight +
                                            margins.bottom) + ')')
       .call(Ember.EmberViz.Helpers.makeYAxisElement(y2Scale, yTickFormat)
               .tickSize(-1 * _mainChartWidth, 0, 0)
               .ticks(3)
               .tickFormat('')
       );

      // Add the chart lines.

      line2 = lineType()
          .x(function(d) { return x2Scale(d.x); })
          .y(function(d) { return y2Scale(d.y); });


      g.select('.focus-chart-lines')
       .selectAll('.focus-chart-line')
       .data(data)
      .enter()
       .append('path')
       .attr('class', 'focus-chart-line')
       .attr('transform',
             'translate(0,' + (_mainChartHeight + margins.bottom) + ')')
       .attr('d', function(d) { return line2(d.values); })
       .style('stroke', _colorFn);
    },

    _render: function() {

      var g,
          tooltipCircle,
          $tooltipDiv,
          _colorFn = this.get('_colorFn'),
          _data = this.get('_data'),
          _mainChartHeight = this.get('_mainChartHeight'),
          _focusChartHeight = this.get('_focusChartHeight'),
          _mainChartWidth = this.get('_mainChartWidth'),

          elementId = this.get('elementId'),
          $container = $('#' + elementId),

          height = this.get('height'),
          width = this.get('width'),

          margins = this.get('margins'),
          self = this,
          valueFormatFn = this.get('valueFormatFn'),
          xScale = this.get('xScale'),
          x2Scale = this.get('x2Scale'),
          xTickFormat = this.get('timeTickFormatFn'),
          yTickFormat = this.get('valueTickFormatFn'),
          yScale = this.get('yScale'),
          y2Scale = this.get('y2Scale');

      // Clear the div.
      $container.empty();

      if (Ember.isEmpty(_data)) {

        // TODO: Show some indication that there is no data.
        return;
      }


      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      g = d3.select('#' + elementId).append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('class', 'ember-viz-chart')
        .attr('transform',
              'translate(' + margins.left + ',' + margins.top + ')');

      // Create and add the tooltip div.
      $tooltipDiv = $('<div>').addClass('chart-tooltip');
      $container.append($tooltipDiv);

      g.append('g').attr('class', 'grid main-x-grid');
      g.append('g').attr('class', 'grid main-y-grid');
      g.append('g').attr('class', 'grid focus-x-grid');
      g.append('g').attr('class', 'grid focus-x-grid');

      g.append('g').attr('class', 'axis main-x-axis');
      g.append('g').attr('class', 'axis main-y-axis');
      g.append('g').attr('class', 'chart-lines');
      g.append('g').attr('class', 'focus-chart-lines');
      g.append('circle').attr('class', 'tooltip-circle');

      g.append('rect').attr('class', 'hover-rect');

      this._renderMainChart(_data);
      this._renderFocusChart(_data);



      // Taken from crossfilter (http://square.github.com/crossfilter/)
      function resizePath(d) {
        var e = +(d == 'e'),
            x = e ? 1 : -1,
            y = _focusChartHeight / 3;
        return 'M' + (.5 * x) + ',' + y
            + 'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6)
            + 'V' + (2 * y - 6)
            + 'A6,6 0 0 ' + e + ' ' + (.5 * x) + ',' + (2 * y)
            + 'Z'
            + 'M' + (2.5 * x) + ',' + (y + 8)
            + 'V' + (2 * y - 8)
            + 'M' + (4.5 * x) + ',' + (y + 8)
            + 'V' + (2 * y - 8);
      }

      var focusG = g.append('g')
        .attr('transform', 'translate(0,' + (_mainChartHeight + margins.bottom) + ')');
      focusG.append('g')
         .attr('class', 'focus-brush-background');
      focusG.append('g')
         .attr('class', 'focus-brush');

      var brush = d3.svg.brush()
        .x(x2Scale)
        .on('brush', onBrush);

      window.brush = brush;

      var brushExtent = null;
      var brushBG = focusG.select('.focus-brush-background').selectAll('g')
          .data([brushExtent || brush.extent()])

      var brushBGenter = brushBG.enter()
          .append('g');

      brushBGenter.append('rect')
          .attr('class', 'left')
          .attr('x', 0)
          .attr('y', 0)
          .attr('height', _focusChartHeight);

      brushBGenter.append('rect')
          .attr('class', 'right')
          .attr('x', 0)
          .attr('y', 0)
          .attr('height', _focusChartHeight);

      var gBrush = focusG.select('.focus-brush')
          .call(brush);
      gBrush.selectAll('rect')
          //.attr('y', -5)
          .attr('height', _focusChartHeight);
      gBrush.selectAll('.resize').append('path').attr('d', resizePath);

      function updateBrushBG() {
        if (!brush.empty()) brush.extent(brushExtent);
        brushBG
            .data([brush.empty() ? x2Scale.domain() : brushExtent])
            .each(function(d, i) {
              var leftWidth = x2Scale(d[0]) - x2Scale.range()[0],
                  rightWidth = x2Scale.range()[1] - x2Scale(d[1]);
              d3.select(this).select('.left')
                .attr('width', leftWidth < 0 ? 0 : leftWidth);

              d3.select(this).select('.right')
                .attr('x', x2Scale(d[1]))
                .attr('width', rightWidth < 0 ? 0 : rightWidth);
            });
      }
      function onBrush() {
        console.log('A brush happened!', arguments);
        brushExtent = brush.empty() ? null : brush.extent();
        console.log('Brush extent:', brushExtent);

        // brushExtent = [1385337600000, 1385510400000];

        var filteredData = _data.map(function(series) {
          var filtered_vals = series.values.filter(function(dataPoint) {
              if (brushExtent == null) return true;
              else {
                return dataPoint.x >= brushExtent[0] && dataPoint.x <= brushExtent[1];
              }
            });
            console.log('Filtered length:', filtered_vals.length);
          return {
            key: series.key,
            values: filtered_vals
          };
        });
        self._renderMainChart(filteredData);

        updateBrushBG();
      }

      // TODO: Allow the developer to bind event handlers. (onclick, etc.)
    }.observes('_data')
  });

  Ember.Handlebars.helper('line-with-focus-chart', Ember.EmberViz.LineWithFocusChartComponent);
});
