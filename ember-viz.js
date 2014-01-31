(function() {
  Ember.EmberViz = Ember.Namespace.create();
})();

(function() {
  Ember.EmberViz.Helpers = Ember.Namespace.create({
    getDomain: function(seriesArray, accessFunction) {
      var enabledSeries = seriesArray.rejectBy('disabled');
      var minValue = d3.min(enabledSeries,
                        function(d) {
                          return d3.min(d.values, accessFunction); }),
          maxValue = d3.max(enabledSeries,
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
    },
    arePointsEqual: function(p1, p2) {
      return p1 && p2 && p1.x == p2.x && p1.y == p2.y;
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
    legendMargins: {top: 0, right: 50, bottom: 0, left: 50},
    forceY: null,
    forceX: null,
    showLegend: false,
    legendHeight: 100,
    lineType: d3.svg.line,
    shouldRender: false,

    onRender: null,
    onClick: null,

    // Normally, the component chooses its size based on the container size, as
    // the CSS formats it. If CSS doesn't specify a size, then these default
    // values are used. To force a specific size, override the 'height' and
    // 'width' attributes or apply CSS height and width styles to the div.
    defaultWidth: 600,
    defaultHeightRatio: 0.5,

    showTooltip: true,
    timeFormatter: d3.time.format.utc,

    // Scales need to be computed properties so that multiple charts on a page
    // don't share the created scale.
    xScale: function() {
      return d3.time.scale.utc();
    }.property(),

    yScale: function() {
      return d3.scale.linear();
    }.property(),


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

      this._render();

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

    /***************************************************************************
     * Private variables and functions that should not be overwritten.
     **************************************************************************/

    _getTooltipContentFn: function(valueFormatFn, timeFormatFn) {
      return function(elem, seriesName) {
        return '<h5>' + seriesName + '</h5>' +
               '<hr />' +
               '<p>' + valueFormatFn(elem.y) + ' at ' +
               timeFormatFn(new Date(elem.x)) + '</p>';
      }
    },

    _getLineFn: function(line) {
      return function(d) {
        if (d.disabled) {
          return line([]);
        } else {
          return line(d.values);
        }
      };

    },

    _getTimeFormatFn: function(data, xDomain) {
      var timeFormatFn = this.get('timeFormatFn'),
          totalTimeRange = xDomain[1] - xDomain[0],
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(data);

      if (timeFormatFn) {
        return timeFormatFn;
      }

      // If the average granularity is around or greater than one point per day,
      // only show month and date.
      if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      if (avgGranularity <= MILLISECONDS_IN_MINUTE) {
        return timeFormatter('%m/%d %H:%M:%S');
      }

      return timeFormatter('%m/%d %H:%M');
    },


    _getTimeTickFormatFn: function(data, xDomain) {
      var timeTickFormatFn = this.get('timeTickFormatFn'),
          totalTimeRange = xDomain[1] - xDomain[0],
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(data);

      if (timeTickFormatFn) {
        return timeTickFormatFn;
      }

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

    },
    _getXDomain: function(data) {
      var domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.x; });

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));

    },

    _getYDomain: function(data) {
      var domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.y; });

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceY'));

    },

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

        if (series.disabled) return;

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
      var prevClosestPoint,
          self = this,
          _data = this.get('_data'),
          margins = this.get('margins'),
          elementId = this.get('elementId'),
          $tooltipDiv = this.get('_tooltipDiv'),
          tooltipCircle = this.get('_tooltipCircle'),
          valueFormatFn = this.get('valueFormatFn'),
          xDomain = this._getXDomain(_data),
          timeFormatFn = this._getTimeFormatFn(_data, xDomain),
          tooltipContentFn = this._getTooltipContentFn(valueFormatFn,
                                                       timeFormatFn);

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

          // If the closest point is different this time, reset the
          // tooltipCircle in preparation for the transition animation.
          if (!Ember.EmberViz.Helpers.arePointsEqual(closestPoint,
                                                     prevClosestPoint)) {
            tooltipCircle.style('display', 'inline')
              .attr('cx', closestPoint.xPx + 'px')
              .attr('cy', closestPoint.yPx + 'px')
              .attr('r', 3)
              .style('opacity', 0.3);
          }

          // Position the tooltipCircle around the closest point.
          tooltipCircle.style('display', 'inline')
            .transition()
            .duration(150)
            .attrTween('r', function(d, i, a) {
              return d3.interpolate(a, 7);
            })
            .styleTween('opacity', function(d, i, a) {
              return d3.interpolate(a, 0.8);
            });

            prevClosestPoint = closestPoint;
        } else {
          prevClosestPoint = null;
          // Hide the tooltip
          $tooltipDiv.css('display', 'none');
          tooltipCircle.style('display', 'none');
        }
      }
    }.property('_tooltipDiv', '_tooltipCircle'),

    _handleMouseClick: function() {
      var self = this,
          _data = this.get('_data'),
          margins = this.get('margins'),
          userOnClick = this.get('onClick');

      return function() {
        var html,
            closestPoint,
            position = d3.mouse(this),
            xPosition = position[0],
            yPosition = position[1],
            closestPointInfo = self._findClosestPoint(_data, xPosition,
                                                      yPosition);

        // If a closest point was found inside the appropriate radius, pass the
        // location and data to the user provided callback;
        if (userOnClick) {
          if (closestPointInfo) {
            closestPoint = closestPointInfo.point;
            userOnClick({x: position[0],      y: position[1]},
                        {x: closestPoint.xPx, y: closestPoint.yPx},
                        {x: closestPoint.x,   y: closestPoint.y});
          } else {
            userOnClick({x: position[0], y: position[1]}, null, null);
          }
        }
      };

    }.property('onClick'),

    didInsertElement: function() {
      var self = this;

      this.notifyPropertyChange('height');
      this.notifyPropertyChange('width');
      this.set('shouldRender', true);
      this._render();

      // Re-render the chart when the window is resized.
      $(window).resize(function() {
        self.notifyPropertyChange('height');
        self.notifyPropertyChange('width');
        self._render();
      });
    },
    _render: function() {
      var shouldRender = this.get('shouldRender');
      if (!shouldRender) return;

      var _handleMouseMove,
          _handleMouseClick,
          line,
          lineFn,
          g,
          svg,
          tooltipCircle,
          xAxis,
          yAxis,
          xGrid,
          yGrid,
          xDomain,
          yDomain,
          xTickFormat,
          $tooltipDiv,
          _colorFn = this.get('_colorFn'),
          _data = this.get('_data'),
          _mainChartHeight = this.get('_mainChartHeight'),
          _mainChartWidth = this.get('_mainChartWidth'),


          elementId = this.get('elementId'),
          $container = $('#' + elementId),

          height = this.get('height'),
          width = this.get('width'),

          legendHeight = this.get('legendHeight'),
          lineType = this.get('lineType'),
          margins = this.get('margins'),
          legendMargins = this.get('legendMargins'),
          self = this,
          showLegend = this.get('showLegend'),
          showTooltip = this.get('showTooltip'),
          valueFormatFn = this.get('valueFormatFn'),
          xScale = this.get('xScale'),
          yScale = this.get('yScale'),
          yTickFormat = this.get('valueTickFormatFn'),

          userOnRender = this.get('onRender');

      // Clear the div.
      $container.empty();

      if (Ember.isEmpty(_data)) {

        // TODO: Show some indication that there is no data.
        return;
      }

      xDomain = this._getXDomain(_data);
      yDomain = this._getYDomain(_data);
      xTickFormat = this._getTimeTickFormatFn(_data, xDomain);

      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      svg = d3.select('#' + elementId).append('svg')
        .attr('class', 'ev-svg')
        .attr('width', width)
        .attr('height', height);
      g = svg
        .append('g')
        .attr('transform',
              'translate(' + margins.left + ',' + margins.top + ')');

      if (showLegend) {
        var $legendDiv = $('<div class="ev-legend">')
          .css('max-height', legendHeight)
          .css('margin-top', legendMargins.top)
          .css('margin-right', legendMargins.right)
          .css('margin-bottom', legendMargins.bottom)
          .css('margin-left', legendMargins.left);
        $container.append($legendDiv);

        // jQuery can't add the svg and circle elements correctly, so switch to
        // using d3.
        var legendDiv = d3.select('#' + elementId + ' .ev-legend');
        var actualData = this.get('data');
        _data.forEach(function(elem, index) {
          var key = elem['key'],
              color = _colorFn(elem, index),
              div = legendDiv.append('div');

          var circle = div.append('svg')
            .attr('class', 'ev-svg')
            .attr('height', 12)
            .attr('width', 14)
          .append('circle')
            .attr('fill', color)
            .attr('stroke', 'black')
            .attr('cx', 6)
            .attr('cy', 6)
            .attr('r', 5);

          div.append('a')
            .text(key + ' ');

          function clickCommon() {
            var yDomain = self._getYDomain(_data);
            var xDomain = self._getXDomain(_data);

            xScale.domain(xDomain);
            yScale.domain(yDomain);

            g.select('.ev-grid.y-grid')
             .call(yGrid);
            g.select('.ev-axis.x-axis')
             .call(xAxis);
            g.select('.ev-axis.y-axis')
             .call(yAxis);

            g.selectAll('.ev-chart-line')
             .attr('d', lineFn);
            self._precomputePoints(_data, xScale, yScale);
          }
          var clickTimeoutId = 0,
              doubleclick = false;
          div.on('dblclick', function() {
            doubleclick = true;

            // Communicate the disabled status of each element back to the
            // original data array.
            actualData.setEach('disabled', true);
            actualData[index].disabled = false;

            // Record the disabled status of each element in the internal array.
            _data.setEach('disabled', true);
            elem.disabled = false;

            legendDiv.selectAll('circle')
              .attr('fill', 'white');
            circle.attr('fill', color);
            clickCommon();
            window.setTimeout(function() { doubleclick = false; }, 800);
          });
          div.on('click', function() {
            if (!clickTimeoutId) {
              clickTimeoutId = window.setTimeout(function() {
                if (!doubleclick) {
                  elem.disabled = (elem.disabled) ? false : true;
                  if (elem.disabled) {
                    circle.attr('fill', 'white');
                  } else {
                    circle.attr('fill', color);
                  }
                  clickCommon();
                }
                clickTimeoutId = 0;
              }, 200);
            }
          });
        });

        // TODO: CLEAN UP THIS NONSENSE
        var newHeight = height - $legendDiv.outerHeight();
        svg.attr('height', newHeight);
        _mainChartHeight -= $legendDiv.outerHeight();
        yScale.range([_mainChartHeight, 0]);
      }

      xScale
        .domain(xDomain)
        .range([0, _mainChartWidth]);

      yScale
        .domain(yDomain)
        .range([_mainChartHeight, 0]);

      line = lineType()
          .x(function(d) { return xScale(d.x); })
          .y(function(d) { return yScale(d.y); });

      lineFn = this._getLineFn(line);

      // Create and add the tooltip div.
      $tooltipDiv = $('<div>').addClass('ev-chart-tooltip');
      $container.append($tooltipDiv);
      this.set('_tooltipDiv', $tooltipDiv);

      // Add the grid lines.
      xGrid = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat)
        .tickSize(-1 * _mainChartHeight, 0, 0)
        .tickFormat('');

      g.append('g')
         .attr('class', 'ev-grid x-grid')
         .attr('transform', 'translate(0,' + _mainChartHeight + ')')
         .call(xGrid);

      yGrid = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat)
        .tickSize(-1 * _mainChartWidth, 0, 0)
        .tickFormat('');

      g.append('g')
         .attr('class', 'ev-grid y-grid')
         .call(yGrid);

      // Add the x axis.
      xAxis = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat);
      g.append('g')
          .attr('class', 'x-axis ev-axis')
          .attr('transform', 'translate(0,' + _mainChartHeight + ')')
          .call(xAxis);

      // Add the y axis.
      yAxis = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat);
      g.append('g')
          .attr('class', 'y-axis ev-axis')
          .call(yAxis);

      // Add the chart lines.
      g.selectAll('.ev-chart-line')
         .data(_data.filter(function(d) { return !d.disabled; }))
       .enter()
         .append('path')
         .attr('class', 'ev-chart-line')
         .attr('d', lineFn)
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
        _handleMouseClick = this.get('_handleMouseClick');

        // Add an invisible rectangle to detect mouse movements.
        g.append('rect')
           .attr('width', _mainChartWidth)
           .attr('height', _mainChartHeight)
           .style('opacity', 0)
           .on('mousemove', _handleMouseMove)
           .on('click', _handleMouseClick)

           // Hide the tooltip when the mouse leaves the hover rectangle.
           .on('mouseout', function() {
             $tooltipDiv.css('display', 'none');
             tooltipCircle.style('display', 'none');
           });


        // Precompute the pixel locations of all the points, but only after the
        // rest  of the chart is rendered.
        this._precomputePoints(_data, xScale, yScale);
      }

      if (userOnRender) {
        userOnRender();
      }

      // TODO: Allow the developer to bind event handlers. (onclick, etc.)
    }.observes('_data')
  });

  Ember.Handlebars.helper('line-chart', Ember.EmberViz.LineChartComponent);
}) ();

$(function() {
  Ember.EmberViz.FocusWithContextChartComponent =
    Ember.EmberViz.LineChartComponent.extend({

    classNames: ['ev-focus-with-context-chart'],
    brushExtent: null,
    defaultHeight: 400,
    defaultWidth: 600,
    contextHeight: 70,
    contextWidth: Ember.computed.alias('width'),
    contextMargins: {top: 10, right: 20, bottom: 30, left: 50},

    onBrush: null,

    // Scales need to be computed properties so that multiple charts on a page
    // don't share the created scale.
    x2Scale: function() {
      return d3.time.scale.utc();
    }.property(),

    y2Scale: function() {
      return d3.scale.linear();
    }.property(),

    _getXDomain: function(data, brushExtent) {
      var domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.x; });

      if (brushExtent) {
        domain = brushExtent;
      }

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));

    },

    _getX2Domain: function(data) {
      var domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.x; });

      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));

    },

    _getYDomain: function(data, brushExtent, overrideDomain) {

      if (brushExtent) {
        var minValue = null;
        var maxValue = null;

        var enabledSeries = data.rejectBy('disabled');
        enabledSeries.forEach(function(series) {
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

      if (overrideDomain) {
        return Ember.EmberViz.Helpers.overrideDomain(domain,
                                                     this.get('forceY'));
      } else {
        return domain;
      }

    },

    _contextChartHeight: function() {
      var contextHeight = this.get('contextHeight'),
          margins = this.get('contextMargins');
      return contextHeight - margins.bottom - margins.top;
    }.property('contextHeight'),

    _contextChartWidth: function() {
      var contextWidth = this.get('contextWidth'),
          margins = this.get('contextMargins');
      return contextWidth - margins.left - margins.right;
    }.property('contextWidth'),

    // Override this height to create space for the context chart.
    _mainChartHeight: function() {
      var height = this.get('height'),
          contextHeight = this.get('contextHeight'),
          margins = this.get('margins');

      return height - contextHeight - margins.top - margins.bottom;
    }.property('height', 'contextHeight', 'margins'),

    _render: function() {
      var shouldRender = this.get('shouldRender');
      if (!shouldRender) return;

      var g,
          svg,
          contextG,
          brushBG,
          brushBGenter,
          gBrush,
          lineFn,
          tooltipCircle,
          $tooltipDiv,
          xDomain,
          x2Domain,
          yDomain,
          _handleMouseClick,
          _handleMouseMove,
          _colorFn = this.get('_colorFn'),
          _data = this.get('_data'),
          _mainChartHeight = this.get('_mainChartHeight'),
          _contextChartHeight = this.get('_contextChartHeight'),
          _mainChartWidth = this.get('_mainChartWidth'),
          _contextChartWidth = this.get('_contextChartWidth'),

          elementId = this.get('elementId'),
          $container = $('#' + elementId),

          height = this.get('height'),
          width = this.get('width'),

          brushExtent = this.get('brushExtent'),
          legendHeight = this.get('legendHeight'),
          lineType = this.get('lineType'),
          margins = this.get('margins'),
          contextMargins = this.get('contextMargins'),
          legendMargins = this.get('legendMargins'),
          showLegend = this.get('showLegend'),
          showTooltip = this.get('showTooltip'),
          self = this,
          valueFormatFn = this.get('valueFormatFn'),
          xScale = this.get('xScale'),
          x2Scale = this.get('x2Scale'),
          xTickFormat = this.get('timeTickFormatFn'),
          yTickFormat = this.get('valueTickFormatFn'),
          yScale = this.get('yScale'),
          y2Scale = this.get('y2Scale'),

          userOnBrush = this.get('onBrush'),
          userOnRender = this.get('onRender');

      // Clear the div.
      $container.empty();

      if (Ember.isEmpty(_data)) {

        // TODO: Show some indication that there is no data.
        return;
      }

      xDomain = this._getXDomain(_data, brushExtent);
      x2Domain = this._getX2Domain(_data);
      yDomain = this._getYDomain(_data, brushExtent, true);
      y2Domain = this._getYDomain(_data, null, false);
      xTickFormat = this._getTimeTickFormatFn(_data, xDomain),

      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      svg = d3.select('#' + elementId)
        .append('svg')
        .attr('class', 'ev-svg')
        .attr('width', width)
        .attr('height', height);
      g = svg
        .append('g')
        .attr('class', 'ember-viz-chart')
        .attr('transform',
              'translate(' + margins.left + ',' + margins.top + ')');

      if (showLegend) {
        var $legendDiv = $('<div class="ev-legend">')
          .css('max-height', legendHeight)
          .css('margin-top', legendMargins.top)
          .css('margin-right', legendMargins.right)
          .css('margin-bottom', legendMargins.bottom)
          .css('margin-left', legendMargins.left);
        $container.append($legendDiv);

        // jQuery can't add the svg and circle elements correctly, so switch to
        // using d3.
        var legendDiv = d3.select('#' + elementId + ' .ev-legend');
        var actualData = this.get('data');
        _data.forEach(function(elem, index) {
          var key = elem['key'],
              color = _colorFn(elem, index),
              div = legendDiv.append('div');

          var circle = div.append('svg')
            .attr('class', 'ev-svg')
            .attr('height', 12)
            .attr('width', 14)
          .append('circle')
            .attr('fill', color)
            .attr('stroke', 'black')
            .attr('cx', 6)
            .attr('cy', 6)
            .attr('r', 5);

          div.append('a')
            .text(key + ' ');

          function clickCommon() {
            var yDomain = self._getYDomain(_data, brushExtent, true);
            var xDomain = self._getXDomain(_data, brushExtent);

            xScale.domain(xDomain);
            yScale.domain(yDomain);

            g.select('.ev-grid.main-y-grid')
             .call(yGrid);
            g.select('.ev-axis.main-x-axis')
             .call(xAxis);
            g.select('.ev-axis.main-y-axis')
             .call(yAxis);

            g.selectAll('.ev-chart-line')
             .attr('d', lineFn);
            self._precomputePoints(_data, xScale, yScale);
          }
          div.on('dblclick', function() {
            // Communicate the disabled status of each element back to the
            // original data array.
            actualData.setEach('disabled', true);
            actualData[index].disabled = false;

            // Record the disabled status of each element in the internal array.
            _data.setEach('disabled', true);
            elem.disabled = false;

            legendDiv.selectAll('circle')
              .attr('fill', 'white');
            circle.attr('fill', color);
            clickCommon();
          });
          div.on('click', function() {
            var disabledStatus = (elem.disabled) ? false : true;
            elem.disabled = disabledStatus
            actualData[index].disabled = disabledStatus;

            if (elem.disabled) {
              circle.attr('fill', 'white');
            } else {
              circle.attr('fill', color);
            }
            clickCommon();
          });
        });

        // TODO: CLEAN UP THIS NONSENSE
        var newHeight = height - $legendDiv.outerHeight();
        svg.attr('height', newHeight);
        _mainChartHeight -= $legendDiv.outerHeight();
        yScale.range([_mainChartHeight, 0]);
      }

      xScale
        .domain(xDomain)
        .range([0, _mainChartWidth]);

      yScale
        .domain(yDomain)
        .range([_mainChartHeight, 0]);

      x2Scale
        .domain(x2Domain)
        .range([0, _contextChartWidth]);

      y2Scale
        .domain(y2Domain)
        .range([_contextChartHeight, 0]);

      xGrid = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat)
        .tickSize(-1 * _mainChartHeight, 0, 0)
        .tickFormat('');
      yGrid = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat)
        .tickSize(-1 * _mainChartWidth, 0, 0)
        .tickFormat('');


      xAxis = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat);
      yAxis = Ember.EmberViz.Helpers.makeYAxisElement(yScale, yTickFormat);
      x2Axis = Ember.EmberViz.Helpers.makeXAxisElement(x2Scale, xTickFormat);

      line = lineType()
          .x(function(d) { return xScale(d.x); })
          .y(function(d) { return yScale(d.y); });
      line2 = lineType()
          .x(function(d) { return x2Scale(d.x); })
          .y(function(d) { return y2Scale(d.y); });

      lineFn = this._getLineFn(line);

      var brush = d3.svg.brush()
        .x(x2Scale)
        .on('brush', onBrush);

      if (brushExtent) {
        brush.extent(brushExtent);
      }

      // Create and add the tooltip div.
      $tooltipDiv = $('<div>').addClass('ev-chart-tooltip');
      $container.append($tooltipDiv);
      this.set('_tooltipDiv', $tooltipDiv);

      // Add the grid lines.
      g.append('g')
       .attr('class', 'ev-grid main-x-grid')
       .attr('transform', 'translate(0,' + _mainChartHeight + ')')
       .call(xGrid);

      g.append('g')
       .attr('class', 'ev-grid main-y-grid')
       .call(yGrid);

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
             'translate(0,' + (_mainChartHeight + margins.bottom +
                               _contextChartHeight + contextMargins.top) + ')')
       .call(x2Axis);

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
        .attr('d', lineFn)
        .style('stroke', _colorFn);

      g.append('g')
       .attr('class', 'ev-context-chart-lines')
       .selectAll('.ev-context-chart-line')
       .data(_data)
      .enter()
       .append('path')
       .attr('class', 'ev-context-chart-line')
       .attr('transform',
             'translate(0,' + (_mainChartHeight + margins.bottom +
                               contextMargins.top) + ')')
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

        _handleMouseClick = this.get('_handleMouseClick');
        _handleMouseMove = this.get('_handleMouseMove');

        // Add an invisible rectangle to detect mouse movements.
        g.append('rect')
         .attr('class', 'hover-rect')
         .attr('width', _mainChartWidth)
         .attr('height', _mainChartHeight)
         .style('opacity', 0)
         .on('mousemove', _handleMouseMove)
         .on('click', _handleMouseClick)

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
              'translate(0,' + (_mainChartHeight + margins.bottom +
                                contextMargins.top) + ')');
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

        xDomain = self._getXDomain(_data, brushExtent);
        yDomain = self._getYDomain(_data, brushExtent, true);


        xTickFormat = self._getTimeTickFormatFn(_data, xDomain);
        xAxis = Ember.EmberViz.Helpers.makeXAxisElement(xScale, xTickFormat);

        xScale.domain(xDomain);
        yScale.domain(yDomain);
        g.select('.ev-chart-lines')
         .selectAll('.ev-chart-line')
         .attr('d', lineFn);
        g.select('.ev-grid.main-x-grid')
         .call(xGrid);
        g.select('.ev-grid.main-y-grid')
         .call(yGrid);
        g.select('.ev-axis.main-x-axis')
         .call(xAxis);
        g.select('.ev-axis.main-y-axis')
         .call(yAxis);

        updateBrushBG();

        if (showTooltip) {
          self._precomputePoints(_data, xScale, yScale);
        }

        // If the user supplied an onbrush callback, call it.
        if (userOnBrush) {
          userOnBrush(brushExtent);
        }
      }

      onBrush();
      if (userOnRender) {
        userOnRender();
      }

    }.observes('_data')
  });

  Ember.Handlebars.helper('focus-with-context-chart',
                          Ember.EmberViz.FocusWithContextChartComponent);
});
