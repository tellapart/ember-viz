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
    lineType: d3.svg.line(),

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
          ranges = this.get('_dataRanges'),
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
          ranges = this.get('_dataRanges'),
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
    _dataRanges: function() {
      var _data = this.get('_data'),
          forceY = this.get('forceY'),
          forceX = this.get('forceX'),
          ranges = Ember.EmberViz.Helpers.getRanges(_data);

      // If any forceX or forceY were provided, override the ranges derived from
      // from the data.
      Ember.EmberViz.Helpers.overrideRange(ranges.y, forceY);
      Ember.EmberViz.Helpers.overrideRange(ranges.x, forceX);

      return ranges;
    }.property('_data'),

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

    _precomputePoints: function(xScale, yScale) {
      var x,
          data = this.get('_data'),
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
          ranges = this.get('_dataRanges'),
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

      // Since both the grid lines and the actual axes are constructed using d3
      // axes, these functions allow easy creation multiple times.
      function makeXAxisElement() {
        return d3.svg.axis()
                 .scale(xScale)
                 .orient('bottom')
                 .tickFormat(xTickFormat)
                 .ticks(7);
      }
      function makeYAxisElement() {
        return d3.svg.axis()
                 .scale(yScale)
                 .orient('left')
                 .tickFormat(yTickFormat);
      }

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
      xAxis = makeXAxisElement();
      svg.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,' + _mainChartHeight + ')')
          .call(xAxis);

      // Add the y axis.
      yAxis = makeYAxisElement();
      svg.append('g')
          .attr('class', 'y axis')
          .call(yAxis);

      // Add the grid lines.
      svg.append('g')
         .attr('class', 'grid')
         .attr('transform', 'translate(0,' + _mainChartHeight + ')')
         .call(makeXAxisElement().tickSize(-1 * _mainChartHeight, 0, 0)
                                 .tickFormat('')
         );
      svg.append('g')
         .attr('class', 'grid')
         .call(makeYAxisElement().tickSize(-1 * _mainChartWidth, 0, 0)
                                 .tickFormat('')
         );

      // Add the chart lines.
      line = lineType
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
        this._precomputePoints(xScale, yScale);
      }

      // TODO: Allow the developer to bind event handlers. (onclick, etc.)
    }.observes('_data')
  });

  Ember.Handlebars.helper('line-chart', Ember.EmberViz.LineChartComponent);

  console.log('Got here');
}) ();
