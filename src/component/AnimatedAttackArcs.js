/**
 * Animated Attack Arcs for D3.js World Maps
 * 
 * A pure D3.js implementation for creating animated attack arcs between coordinates
 * on a world map, similar to Check Point Threat Map.
 * 
 * Features:
 * - Curved arcs between longitude/latitude coordinates
 * - Animated flowing effects with stroke-dasharray
 * - Moving particles along arc paths
 * - Multiple curve types (globe, great-circle, parabolic)
 * - Professional styling with gradients and effects
 * - Works with any D3 projection
 * - Pure D3.js and SVG (no external dependencies)
 */

class AnimatedAttackArcs {
  constructor(svg, projection, options = {}) {
    this.svg = svg;
    this.projection = projection;
    this.options = {
      strokeWidth: 3,
      opacity: 0.85,
      animationDuration: 2000,
      particleInterval: 1200,
      particleSize: 1.5,
      curveType: 'globe', // 'globe', 'great-circle', 'parabolic'
      ...options
    };
    
    this.arcs = new Map();
    this.particleIntervals = new Map();
    
    // Create arcs group
    this.arcsGroup = this.svg.append("g")
      .attr("class", "animated-attack-arcs");
    
    // Create gradient definitions
    this.createGradients();
  }

  /**
   * Create SVG gradients for professional arc styling
   */
  createGradients() {
    const defs = this.svg.select('defs').empty() 
      ? this.svg.insert('defs', ':first-child')
      : this.svg.select('defs');

    const gradients = [
      { id: 'critical-gradient', color1: '#ff0000', color2: '#ff6666' },
      { id: 'high-gradient', color1: '#ff6600', color2: '#ff9933' },
      { id: 'medium-gradient', color1: '#ffaa00', color2: '#ffcc66' },
      { id: 'low-gradient', color1: '#00aa00', color2: '#66cc66' }
    ];

    gradients.forEach(grad => {
      const gradient = defs.append('linearGradient')
        .attr('id', grad.id)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%');

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', grad.color1)
        .attr('stop-opacity', '0.8');

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', grad.color2)
        .attr('stop-opacity', '0.4');
    });
  }

  /**
   * Create curved arc path between two points
   * @param {Array} source - [longitude, latitude]
   * @param {Array} target - [longitude, latitude]
   * @param {string} curveType - 'globe', 'great-circle', 'parabolic'
   * @returns {string} SVG path string
   */
  createArcPath(source, target, curveType = this.options.curveType) {
    const sourcePoint = this.projection(source);
    const targetPoint = this.projection(target);
    
    if (!sourcePoint || !targetPoint) return '';

    const dx = targetPoint[0] - sourcePoint[0];
    const dy = targetPoint[1] - sourcePoint[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate arc height based on curve type
    let arcHeight;
    switch (curveType) {
      case 'great-circle':
        arcHeight = Math.min(distance * 0.3, 150);
        break;
      case 'parabolic':
        arcHeight = Math.min(distance * 0.8, 400);
        break;
      default: // 'globe'
        arcHeight = Math.min(distance * 0.6, 300);
    }

    const midX = (sourcePoint[0] + targetPoint[0]) / 2;
    const midY = (sourcePoint[1] + targetPoint[1]) / 2 - arcHeight;

    if (curveType === 'great-circle') {
      // Quadratic curve for great circle style
      return `M${sourcePoint[0]},${sourcePoint[1]}Q${midX},${midY} ${targetPoint[0]},${targetPoint[1]}`;
    } else {
      // Cubic bezier curve for dramatic arcs
      const cp1X = sourcePoint[0] + (midX - sourcePoint[0]) * 0.5;
      const cp1Y = sourcePoint[1] - arcHeight * 0.3;
      const cp2X = targetPoint[0] - (targetPoint[0] - midX) * 0.5;
      const cp2Y = targetPoint[1] - arcHeight * 0.3;

      return `M${sourcePoint[0]},${sourcePoint[1]}C${cp1X},${cp1Y} ${cp2X},${cp2Y} ${targetPoint[0]},${targetPoint[1]}`;
    }
  }

  /**
   * Get point along arc path at given progress (0-1)
   * @param {Array} source - [longitude, latitude]
   * @param {Array} target - [longitude, latitude]
   * @param {number} progress - Progress along arc (0-1)
   * @param {string} curveType - Curve type
   * @returns {Array} [x, y] coordinates
   */
  getPointAlongArc(source, target, progress, curveType = this.options.curveType) {
    const sourcePoint = this.projection(source);
    const targetPoint = this.projection(target);
    
    if (!sourcePoint || !targetPoint) return [0, 0];

    const dx = targetPoint[0] - sourcePoint[0];
    const dy = targetPoint[1] - sourcePoint[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let arcHeight;
    switch (curveType) {
      case 'great-circle':
        arcHeight = Math.min(distance * 0.3, 150);
        break;
      case 'parabolic':
        arcHeight = Math.min(distance * 0.8, 400);
        break;
      default:
        arcHeight = Math.min(distance * 0.6, 300);
    }

    const midX = (sourcePoint[0] + targetPoint[0]) / 2;
    const midY = (sourcePoint[1] + targetPoint[1]) / 2 - arcHeight;

    if (curveType === 'great-circle') {
      // Quadratic bezier interpolation
      const t = progress;
      const x = Math.pow(1 - t, 2) * sourcePoint[0] + 2 * (1 - t) * t * midX + Math.pow(t, 2) * targetPoint[0];
      const y = Math.pow(1 - t, 2) * sourcePoint[1] + 2 * (1 - t) * t * midY + Math.pow(t, 2) * targetPoint[1];
      return [x, y];
    } else {
      // Cubic bezier interpolation
      const cp1X = sourcePoint[0] + (midX - sourcePoint[0]) * 0.5;
      const cp1Y = sourcePoint[1] - arcHeight * 0.3;
      const cp2X = targetPoint[0] - (targetPoint[0] - midX) * 0.5;
      const cp2Y = targetPoint[1] - arcHeight * 0.3;

      const t = progress;
      const x = Math.pow(1 - t, 3) * sourcePoint[0] +
                3 * Math.pow(1 - t, 2) * t * cp1X +
                3 * (1 - t) * Math.pow(t, 2) * cp2X +
                Math.pow(t, 3) * targetPoint[0];
      const y = Math.pow(1 - t, 3) * sourcePoint[1] +
                3 * Math.pow(1 - t, 2) * t * cp1Y +
                3 * (1 - t) * Math.pow(t, 2) * cp2Y +
                Math.pow(t, 3) * targetPoint[1];
      return [x, y];
    }
  }

  /**
   * Add an animated attack arc
   * @param {string} id - Unique identifier for the arc
   * @param {Array} source - [longitude, latitude] of source
   * @param {Array} target - [longitude, latitude] of target
   * @param {Object} options - Arc styling options
   */
  addArc(id, source, target, options = {}) {
    const arcOptions = {
      color: '#ff0000',
      strokeWidth: this.options.strokeWidth,
      curveType: this.options.curveType,
      animationDuration: this.options.animationDuration,
      particleInterval: this.options.particleInterval,
      ...options
    };

    // Remove existing arc if it exists
    this.removeArc(id);

    const sourcePoint = this.projection(source);
    const targetPoint = this.projection(target);
    
    if (!sourcePoint || !targetPoint) return;

    // Create arc path
    const arcPath = this.arcsGroup
      .append("path")
      .attr("class", `attack-arc ${id}`)
      .attr("d", this.createArcPath(source, target, arcOptions.curveType))
      .style("fill", "none")
      .style("stroke", arcOptions.color)
      .style("stroke-width", arcOptions.strokeWidth)
      .style("opacity", this.options.opacity)
      .style("filter", `drop-shadow(0 0 8px ${arcOptions.color}) blur(0.5px)`)
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round")
      .attr("data-arc-id", id);

    // Add flowing animation
    const pathElement = arcPath.node();
    if (pathElement) {
      const pathLength = pathElement.getTotalLength();
      const dashLength = 15;
      const gapLength = 8;

      pathElement.style.strokeDasharray = `${dashLength},${gapLength}`;
      pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;

      const animateArc = () => {
        pathElement.style.transition = `stroke-dashoffset ${arcOptions.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        pathElement.style.strokeDashoffset = `${-pathLength - dashLength}`;

        setTimeout(() => {
          pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;
          setTimeout(animateArc, 300);
        }, arcOptions.animationDuration);
      };

      animateArc();
    }

    // Add particle animation
    let particleId = 0;
    const spawnParticle = () => {
      const particle = this.arcsGroup
        .append("circle")
        .attr("class", `attack-particle ${id}-${particleId}`)
        .attr("cx", sourcePoint[0])
        .attr("cy", sourcePoint[1])
        .attr("r", this.options.particleSize)
        .style("fill", arcOptions.color)
        .style("opacity", 0.8)
        .style("filter", `drop-shadow(0 0 3px ${arcOptions.color}) blur(0.3px)`)
        .style("pointer-events", "none");

      // Animate particle along arc
      const startTime = Date.now();
      const duration = 2500;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        if (progress < 1) {
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          const position = this.getPointAlongArc(source, target, easeProgress, arcOptions.curveType);
          
          particle
            .attr("cx", position[0])
            .attr("cy", position[1])
            .style("opacity", 0.8 - progress * 0.3)
            .style("r", this.options.particleSize + Math.sin(progress * Math.PI) * 0.5);

          requestAnimationFrame(animate);
        } else {
          particle.remove();
        }
      };

      animate();
      particleId++;
    };

    // Start particle stream
    spawnParticle();
    const intervalId = setInterval(spawnParticle, arcOptions.particleInterval);

    // Store arc data
    this.arcs.set(id, {
      source,
      target,
      options: arcOptions,
      path: arcPath,
      intervalId
    });
  }

  /**
   * Remove an attack arc
   * @param {string} id - Arc identifier
   */
  removeArc(id) {
    const arc = this.arcs.get(id);
    if (arc) {
      clearInterval(arc.intervalId);
      arc.path.remove();
      this.arcsGroup.selectAll(`.attack-particle.${id}`).remove();
      this.arcs.delete(id);
    }
  }

  /**
   * Update arc path when projection changes
   * @param {string} id - Arc identifier
   */
  updateArcPath(id) {
    const arc = this.arcs.get(id);
    if (arc) {
      const newPath = this.createArcPath(arc.source, arc.target, arc.options.curveType);
      arc.path.attr("d", newPath);
    }
  }

  /**
   * Update all arc paths (call when projection changes)
   */
  updateAllArcPaths() {
    this.arcs.forEach((arc, id) => {
      this.updateArcPath(id);
    });
  }

  /**
   * Clear all arcs
   */
  clear() {
    this.arcs.forEach((arc, id) => {
      this.removeArc(id);
    });
  }

  /**
   * Get all arc IDs
   * @returns {Array} Array of arc IDs
   */
  getArcIds() {
    return Array.from(this.arcs.keys());
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnimatedAttackArcs;
}

// Example usage:
/*
// Initialize with your D3 SVG and projection
const svg = d3.select('#map-svg');
const projection = d3.geoMercator()
  .translate([width / 2, height / 2])
  .scale((width - 1) / 2 / Math.PI);

const attackArcs = new AnimatedAttackArcs(svg, projection, {
  strokeWidth: 4,
  curveType: 'globe',
  animationDuration: 2500
});

// Add attack arcs
attackArcs.addArc('attack1', [-74.00597, 40.71427], [2.35222, 48.85661], {
  color: '#ff0000',
  strokeWidth: 3
});

attackArcs.addArc('attack2', [139.6917, 35.6895], [-0.1276, 51.5074], {
  color: '#ff6600',
  curveType: 'great-circle'
});

// Update when projection changes (e.g., on zoom)
attackArcs.updateAllArcPaths();

// Remove specific arc
attackArcs.removeArc('attack1');

// Clear all arcs
attackArcs.clear();
*/
