(function() {
  Ember.EmberViz = Ember.Namespace.create();
})();

(function() {
  Ember.EmberViz.Helpers = Ember.Namespace.create({
    getDomain: function(seriesArray, accessFunction) {

      var minValue = d3.min(seriesArray,
                        function(d) {
                          return d3.min(d.values, accessFunction); }),
          maxValue = d3.max(seriesArray,
                        function(d) {
                          return d3.max(d.values, accessFunction); });

      return [minValue, maxValue];
    },
    overrideDomain: function(range, newRange) {

      if (newRange !== undefined && newRange !== null) {
        if (!isNaN(newRange[0])) {
          range[0] = newRange[0];
        }
        if (!isNaN(newRange[1])) {
          range[1] = newRange[1];
        }
      }

      return range;
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

    classNames: ['ev-line-chart'],

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
    defaultWidth: 600,
    defaultHeightRatio: 0.5,

    showTooltip: true,
    timeFormatter: d3.time.format.utc,

    xScale: function() {
      return d3.time.scale.utc()
        .domain(this.get('xDomain'))
        .range([0, this.get('_mainChartWidth')]);
    }.property('_mainChartWidth', 'xDomain'),

    yScale: function() {
      return d3.scale.linear()
        .domain(this.get('yDomain'))
        .range([this.get('_mainChartHeight'), 0]);
    }.property('_mainChartHeight', 'yDomain'),


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
          height = $container.height(),
          heightRatio = this.get('defaultHeightRatio'),
          width = this.get('width');

      if (height == 0) {
        // The browser didn't determine a height for the div, so fall back to
        // a default height.

        return heightRatio * width;
        // return this.get('defaultHeight');
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
          xDomain = this.get('xDomain'),
          totalTimeRange = xDomain[1] - xDomain[0],
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
          xDomain = this.get('xDomain'),
          totalTimeRange = xDomain[1] - xDomain[0],
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(_data);

      // If the average granularity is around or greater than one point per day,
      // only show month and date.
      if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If more than 5 days are being displayed, only show month and date on
      // the axis labels.
      if (totalTimeRange > 5 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If we're showing more than one day, but still not enough days to get
      // rid of time altogether, show both the date and time.
      if (totalTimeRange > MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d %H:%M');
      }

      // In the scope of less than a day, show the time without the date.
      return timeFormatter('%H:%M');

    }.property('_data'),

    xDomain: function() {
      var data = this.get('_data');
      var domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.x; });

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));

    }.property('_data', 'forceX'),

    yDomain: function() {
      var data = this.get('_data');
      var domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.y; });

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceY'));

    }.property('_data', 'forceX'),

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

          // Cache the scaled timestamps. It's only efficient to store the
          // cached scaling of the timestamp because each timestamp is probably
          // going to be repeated for each series. Y values are not as likely
          // to be repeated.
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

          // Initialize the "closest" point to one unit past the furthest
          // possible point that is still inside the bounding box.
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
          // unnecessary computation time for the square root) is closer than
          // the closest existing point.
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
    _handleMouseMove: function() {
      var self = this,
          _data = this.get('_data'),
          margins = this.get('margins'),
          elementId = this.get('elementId'),
          $tooltipDiv = this.get('_tooltipDiv'),
          // $('#' + elementId + ' .ev-chart-tooltip'),
          // tooltipCircle = d3.select('#' + elementId + ' .ev-tooltip-circle'),
          tooltipCircle = this.get('_tooltipCircle'),
          tooltipContentFn = this.get('tooltipContentFn');

      return function() {
        var html,
            newLeft,
            newTop,
            closestPoint,
            position = d3.mouse(this),
            xPosition = position[0],
            yPosition = position[1],
            closestPointInfo = self._findClosestPoint(_data, xPosition,
                                                      yPosition);

        // If a closest point was found inside the appropriate radius,
        // display information about that point.
        if (closestPointInfo) {
          closestPoint = closestPointInfo.point;
          html = tooltipContentFn(closestPoint, closestPointInfo.seriesName);

          // Update the tooltipDiv contents.
          $tooltipDiv.html(html);

          // Move the tooltip div near the closest point.
          newLeft = margins.left + closestPoint.xPx;
          newTop = closestPoint.yPx - $tooltipDiv.height() - 10;
          $tooltipDiv
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
      }
    }.property('_tooltipDiv', '_tooltipCircle'),

    didInsertElement: function() {
      var self = this,
          previousResizeFn = window.onresize;

      this.notifyPropertyChange('height');
      this.notifyPropertyChange('width');
      this._render();

      // Re-render the chart when the window is resized.
      window.onresize = function() {
        self.notifyPropertyChange('height');
        self.notifyPropertyChange('width');
        self._render();
        if (previousResizeFn !== null) {
          previousResizeFn();
        }
      };
    },
    _render: function() {

      var _handleMouseMove,
          line,
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
          self = this,
          showTooltip = this.get('showTooltip'),
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

      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      svg = d3.select('#' + elementId).append('svg')
        .attr('class', 'ev-svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform',
              'translate(' + margins.left + ',' + margins.top + ')');

      // Create and add the tooltip div.
      $tooltipDiv = $('<div>').addClass('ev-chart-tooltip');
      $container.append($tooltipDiv);
      this.set('_tooltipDiv', $tooltipDiv);

      // Add the x axis.
      xAxis = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat);
      svg.append('g')
          .attr('class', 'x ev-axis')
          .attr('transform', 'translate(0,' + _mainChartHeight + ')')
          .call(xAxis);

      // Add the y axis.
      yAxis = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat);
      svg.append('g')
          .attr('class', 'y ev-axis')
          .call(yAxis);

      // Add the grid lines.
      svg.append('g')
         .attr('class', 'ev-grid')
         .attr('transform', 'translate(0,' + _mainChartHeight + ')')
         .call(Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat)
                    .tickSize(-1 * _mainChartHeight, 0, 0)
                    .tickFormat('')
         );
      svg.append('g')
         .attr('class', 'ev-grid')
         .call(Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat)
                    .tickSize(-1 * _mainChartWidth, 0, 0)
                    .tickFormat('')
         );

      // Add the chart lines.
      line = lineType()
          .x(function(d) { return xScale(d.x); })
          .y(function(d) { return yScale(d.y); });

      svg.selectAll('.ev-chart-line')
         .data(_data)
       .enter()
         .append('path')
         .attr('class', 'ev-chart-line')
         .attr('d', function(d) { return line(d.values); })
         .style('stroke', _colorFn);

      if (showTooltip) {
        // Add a circle for use with the tooltip.
        tooltipCircle = svg.append('circle')
                           .attr('class', 'ev-tooltip-circle')
                           .attr('cx', 0)
                           .attr('cy', 0)
                           .attr('r', 5);
        this.set('_tooltipCircle', tooltipCircle);
        _handleMouseMove = this.get('_handleMouseMove');

        // Add an invisible rectangle to detect mouse movements.
        svg.append('rect')
           .attr('width', _mainChartWidth)
           .attr('height', _mainChartHeight)
           .style('opacity', 0)
           .on('mousemove', _handleMouseMove)

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
    }.observes('timeTickFormatFn',
               'valueTickFormatFn', 'tooltipContentFn')
  });

  Ember.Handlebars.helper('line-chart', Ember.EmberViz.LineChartComponent);
}) ();

$(function() {
  Ember.EmberViz.FocusWithContextChartComponent =
    Ember.EmberViz.LineChartComponent.extend({

    classNames: ['ev-focus-with-context-chart'],
    brushExtent: null,
    // brushExtent: [new Date(1387495796000), new Date(1388446196000)],
    defaultHeight: 400,
    defaultWidth: 600,
    contextHeight: 70,

    x2Scale: function() {
      return d3.time.scale.utc()
        .domain(this.get('x2Domain'))
        .range([0, this.get('_mainChartWidth')]);
    }.property('_mainChartWidth', 'x2Domain'),

    y2Scale: function() {
      return d3.scale.linear()
        .domain(this.get('yDomain'))
        .range([this.get('_contextChartHeight'), 0]);
    }.property('_contextChartHeight', 'yDomain'),

    xDomain: function() {
      var data = this.get('_data'),
          domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.x; }),
          brushExtent = this.get('brushExtent');

      if (brushExtent) {
        domain = brushExtent;
      }

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));

    }.property('_data', 'forceX', 'brushExtent'),

    x2Domain: function() {
      var data = this.get('_data'),
          domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.x; });

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));

    }.property('_data', 'forceX'),

    yDomain: function() {
      var domain,
          data = this.get('_data');
      var brushExtent = this.get('brushExtent');

      if (brushExtent) {
        var minValue = null;
        var maxValue = null;

        data.forEach(function(series) {
          series.values.forEach(function(point) {

            if (point.x >= brushExtent[0] && point.x <= brushExtent[1]) {
              if (minValue === null || point.y < minValue) minValue = point.y;
              if (maxValue === null || point.y > maxValue) maxValue = point.y;
            }
          });
        });
        domain = [minValue, maxValue];
      } else {
        domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.y; });
      }

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceY'));

    }.property('_data', 'forceX', 'brushExtent'),

    _contextChartHeight: function() {
      var contextHeight = this.get('contextHeight'),
          margins = this.get('margins');
      return contextHeight - margins.bottom;
      // return contextHeight - margins.bottom - margins.top;
    }.property('contextHeight'),

    // Override this height to create space for the context chart.
    _mainChartHeight: function() {
      var height = this.get('height'),
          contextHeight = this.get('contextHeight'),
          margins = this.get('margins');

      return height - contextHeight - margins.top - margins.bottom;
    }.property('height', 'contextHeight', 'margins'),

    _render: function() {

      var g,
          contextG,
          brushBG,
          brushBGenter,
          gBrush,
          tooltipCircle,
          $tooltipDiv,
          _handleMouseMove,
          _colorFn = this.get('_colorFn'),
          _data = this.get('_data'),
          _mainChartHeight = this.get('_mainChartHeight'),
          _contextChartHeight = this.get('_contextChartHeight'),
          _mainChartWidth = this.get('_mainChartWidth'),

          elementId = this.get('elementId'),
          $container = $('#' + elementId),

          height = this.get('height'),
          width = this.get('width'),

          brushExtent = this.get('brushExtent'),
          lineType = this.get('lineType'),
          margins = this.get('margins'),
          showTooltip = this.get('showTooltip'),
          tooltipContentFn = this.get('tooltipContentFn'),
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

      xAxis = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat);
      yAxis = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat);
      x2Axis = Ember.EmberViz.Helpers.makeXAxisElement(x2Scale, xTickFormat);

      xGrid = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat)
        .tickSize(-1 * _mainChartHeight, 0, 0)
        .tickFormat('');
      yGrid = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat)
        .tickSize(-1 * _mainChartWidth, 0, 0)
        .tickFormat('');

      line = lineType()
          .x(function(d) { return xScale(d.x); })
          .y(function(d) { return yScale(d.y); });
      line2 = lineType()
          .x(function(d) { return x2Scale(d.x); })
          .y(function(d) { return y2Scale(d.y); });

      var brush = d3.svg.brush()
        .x(x2Scale)
        .on('brush', onBrush);

      if (brushExtent) {
        brush.extent(brushExtent);
      }

      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      g = d3.select('#' + elementId).append('svg')
        .attr('class', 'ev-svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('class', 'ember-viz-chart')
        .attr('transform',
              'translate(' + margins.left + ',' + margins.top + ')');

      // Create and add the tooltip div.
      $tooltipDiv = $('<div>').addClass('ev-chart-tooltip');
      $container.append($tooltipDiv);
      this.set('_tooltipDiv', $tooltipDiv);

      // Add the axes.
      g.append('g')
       .attr('class', 'ev-axis main-x-axis')
       .attr('transform', 'translate(0,' + _mainChartHeight + ')')
       .call(xAxis);

      g.append('g')
       .attr('class', 'ev-axis main-y-axis')
       .call(yAxis);

      g.append('g')
       .attr('class', 'ev-axis context-x-axis')
       .attr('transform',
             'translate(0,' + (_mainChartHeight + _contextChartHeight +
                               margins.bottom) + ')')
       .call(x2Axis);

      // Add the grid lines.
      g.append('g')
       .attr('class', 'ev-grid main-x-grid')
       .attr('transform', 'translate(0,' + _mainChartHeight + ')')
       .call(xGrid);
      g.select('.main-y-grid')
       .call(yGrid);

      // Add the clip path to hide the lines outside of the main window.
      var clipPathId = elementId + '-clip-path';
      g.append('clipPath')
       .attr('id', clipPathId)
       .append('rect')
       .attr('width', _mainChartWidth)
       .attr('height', _mainChartHeight);

      // Add the chart lines.
      g.append('g')
       .attr('class', 'ev-chart-lines')
       .selectAll('.ev-chart-line')
       .data(_data)
       .enter()
        .append('path')
        .attr('class', 'ev-chart-line')
        .attr('clip-path', 'url(#' + clipPathId + ')')
        .attr('d', function(d) { return line(d.values); })
        .style('stroke', _colorFn);

      g.append('g')
       .attr('class', 'ev-context-chart-lines')
       .selectAll('.ev-context-chart-line')
       .data(_data)
      .enter()
       .append('path')
       .attr('class', 'ev-context-chart-line')
       .attr('transform',
             'translate(0,' + (_mainChartHeight + margins.bottom) + ')')
       .attr('d', function(d) { return line2(d.values); })
       .style('stroke', _colorFn);

      if (showTooltip) {
        // Add a circle for use with the tooltip.
        tooltipCircle = g.append('circle')
                         .attr('class', 'ev-tooltip-circle')
                         .attr('cx', 0)
                         .attr('cy', 0)
                         .attr('r', 5);
        this.set('_tooltipCircle', tooltipCircle);

        _handleMouseMove = this.get('_handleMouseMove');

        // Add an invisible rectangle to detect mouse movements.
        g.append('rect')
         .attr('class', 'hover-rect')
         .attr('width', _mainChartWidth)
         .attr('height', _mainChartHeight)
         .style('opacity', 0)
         .on('mousemove', _handleMouseMove)

         // Hide the tooltip when the mouse leaves the hover rectangle.
         .on('mouseout', function() {
           $tooltipDiv.css('display', 'none');
           tooltipCircle.style('display', 'none');
         });

      }

      // Taken from crossfilter (http://square.github.com/crossfilter/)
      function resizePath(d) {
        var e = +(d == 'e'),
            x = e ? 1 : -1,
            y = _contextChartHeight / 3;
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

      contextG = g.append('g')
        .attr('transform',
              'translate(0,' + (_mainChartHeight + margins.bottom) + ')');
      contextG.append('g')
        .attr('class', 'ev-context-brush-background');
      contextG.append('g')
        .attr('class', 'ev-context-brush');

      brushBG = contextG.select('.ev-context-brush-background').selectAll('g')
        .data([brush.extent()]);

      brushBGenter = brushBG.enter()
        .append('g');

      brushBGenter.append('rect')
        .attr('class', 'left')
        .attr('x', 0)
        .attr('y', 0)
        .attr('height', _contextChartHeight);

      brushBGenter.append('rect')
        .attr('class', 'right')
        .attr('x', 0)
        .attr('y', 0)
        .attr('height', _contextChartHeight);

      gBrush = contextG.select('.ev-context-brush')
        .call(brush);
      gBrush.selectAll('rect')
        .attr('height', _contextChartHeight);
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
        brushExtent = brush.empty() ? null : brush.extent();
        self.set('brushExtent', brushExtent);

        var xDomain = self.get('xDomain');
        var yDomain = self.get('yDomain');

        xScale.domain(xDomain);
        yScale.domain(yDomain);
        g.select('.ev-chart-lines')
         .selectAll('.ev-chart-line')
         .attr('d', function(d) { return line(d.values); });
        g.select('.ev-axis.main-x-axis')
         .call(xAxis);
        g.select('.ev-axis.main-y-axis')
         .call(yAxis);

        updateBrushBG();

        if (showTooltip) {
          self._precomputePoints(_data, xScale, yScale);
        }
      }

      onBrush();

      // TODO: Allow the developer to bind event handlers. (onclick, etc.)
    }.observes('timeTickFormatFn',
               'valueTickFormatFn', 'tooltipContentFn')
  });

  Ember.Handlebars.helper('focus-with-context-chart',
                          Ember.EmberViz.FocusWithContextChartComponent);
});
