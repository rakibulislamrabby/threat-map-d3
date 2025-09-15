'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import worldData from '../data/world.json';
import countryCoordinates from '../data/countryCoordinates.json';
import threatData from '../data/threatData.json';

// Type definitions
interface CountryFeature {
  id: string;
  properties: {
    name: string;
  };
}

interface CountryCoordinate {
  lat: number;
  lng: number;
  name: string;
}

interface ThreatAttack {
  id: string;
  source: string;
  target: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  duration: number;
  description: string;
}

interface ThreatData {
  attacks: ThreatAttack[];
  severityLevels: {
    [key: string]: {
      color: string;
      strokeWidth: number;
    };
  };
}

const SimpleWorldMap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const width = 1100;
  const height = 750;

  useEffect(() => {
    if (!svgRef.current || !tooltipRef.current) return;

    const svg = d3.select(svgRef.current);
    const tooltip = d3.select(tooltipRef.current);

    // Clear any existing content
    svg.selectAll("*").remove();

    // Set up projection
    const projection = d3.geoMercator()
      .translate([width / 2, height / 2])
      .scale((width - 1) / 2 / Math.PI);

    // Set up zoom behavior (zoom only, no drag/pan)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .filter((event) => {
        // Only allow wheel events (zoom), block all drag events
        return event.type === 'wheel';
      })
      .on("zoom", (event) => {
        const { transform } = event;
        // Always zoom from center, ignore any translation
        const centerTransform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(transform.k)
          .translate(-width / 2, -height / 2);
        
        // Transform the main group (contains both countries and arcs)
        svg.selectAll('.main-group')
          .attr("transform", centerTransform.toString());
      });

    svg.call(zoom);

    // Add overlay rect for zoom/pan
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all");

    // Create path generator
    const path = d3.geoPath().projection(projection);

    // Convert topojson to geojson
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const countries = topojson.feature(worldData as any, worldData.objects.world_subunits as any);

    // Create main transform group for both countries and arcs
    const mainGroup = svg.append("g")
      .attr("class", "main-group");

    // Create countries group inside main group
    const countriesGroup = mainGroup.append("g")
      .attr("class", "countries-group");

    // Add countries - ALL SAME GRAY COLOR with hover border effect
    countriesGroup.selectAll(".subunit")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .data((countries as any).features)
      .enter()
      .append("path")
      .attr("class", (d) => {
        const feature = d as CountryFeature;
        return `subunit-boundary subunit gray-country ${feature.id}`;
      })
       .style("fill", "#2a2a2a") // Dark gray for countries
       .style("stroke", "#444444")
      .style("stroke-width", "1px")
      .style("stroke-linejoin", "round")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr("d", path as any)
      .on("mouseover", function(event, d) {
        const feature = d as CountryFeature;

         // Change border color on hover
         d3.select(this)
           .style("stroke", "#666666")
           .style("stroke-width", "2px");
        //   .style("fill", "#aaaaaa");


        // Show tooltip with country name
        const [mouseX, mouseY] = d3.pointer(event, svgRef.current);

        tooltip
          .style("display", "block")
          .style("left", `${mouseX + 5}px`)
          .style("top", `${mouseY - 25}px`)
          .html(`<p>${feature.properties.name}</p>`);
      })
      .on("mouseout", function() {
         // Reset border color
         d3.select(this)
           .style("stroke", "#444444")
           .style("stroke-width", "1px");

         // Reset all countries to original dark gray color
         countriesGroup.selectAll(".subunit")
           .style("fill", "#2a2a2a"); // Original dark gray color

        tooltip.style("display", "none");
      });

    // Add animated attack arcs inside main group
    addAnimatedAttackArcs(mainGroup, projection, tooltip, svgRef.current);

    // Add attack pointers (red glowing circles)
    addAttackPointers(mainGroup, projection);

    // Cleanup function
    return () => {
      // Clear all particle intervals
      svg.selectAll('.attack-arcs').each(function() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const intervalId = (this as any).__particleInterval;
        if (intervalId) {
          clearInterval(intervalId);
        }
      });

       // Clear all animations and particles
       svg.selectAll('.attack-particle').remove();
       svg.selectAll('.attack-arc').remove();
       svg.selectAll('.attack-pointer').remove();
       svg.selectAll('.attack-pointer-outline').remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enhanced function to create dramatic globe-style arc with multiple curve options
  const createDramaticGlobeArc = (source: [number, number], target: [number, number], curveType: 'globe' | 'great-circle' | 'parabolic' = 'globe') => {
    const dx = target[0] - source[0];
    const dy = target[1] - source[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate arc height based on distance and curve type
    let arcHeight: number;
    switch (curveType) {
      case 'great-circle':
        arcHeight = Math.min(distance * 0.3, 150); // Subtle curve
        break;
      case 'parabolic':
        arcHeight = Math.min(distance * 0.8, 400); // Very dramatic curve
        break;
      default: // 'globe'
        arcHeight = Math.min(distance * 0.6, 300); // Moderate dramatic curve
    }

    const midX = (source[0] + target[0]) / 2;
    const midY = (source[1] + target[1]) / 2 - arcHeight;

    if (curveType === 'great-circle') {
      // Simple quadratic curve for great circle style
      return `M${source[0]},${source[1]}Q${midX},${midY} ${target[0]},${target[1]}`;
    } else {
      // Cubic bezier curve for dramatic arcs
      const cp1X = source[0] + (midX - source[0]) * 0.5;
      const cp1Y = source[1] - arcHeight * 0.3;
      const cp2X = target[0] - (target[0] - midX) * 0.5;
      const cp2Y = target[1] - arcHeight * 0.3;

      return `M${source[0]},${source[1]}C${cp1X},${cp1Y} ${cp2X},${cp2Y} ${target[0]},${target[1]}`;
    }
  };

  // Function to get point along arc path at given progress (0-1)
  const getPointAlongArc = (source: [number, number], target: [number, number], progress: number, curveType: 'globe' | 'great-circle' | 'parabolic' = 'globe') => {
    const dx = target[0] - source[0];
    const dy = target[1] - source[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let arcHeight: number;
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

    const midX = (source[0] + target[0]) / 2;
    const midY = (source[1] + target[1]) / 2 - arcHeight;

    if (curveType === 'great-circle') {
      // Quadratic bezier interpolation
      const t = progress;
      const x = Math.pow(1 - t, 2) * source[0] + 2 * (1 - t) * t * midX + Math.pow(t, 2) * target[0];
      const y = Math.pow(1 - t, 2) * source[1] + 2 * (1 - t) * t * midY + Math.pow(t, 2) * target[1];
      return [x, y] as [number, number];
    } else {
      // Cubic bezier interpolation
      const cp1X = source[0] + (midX - source[0]) * 0.5;
      const cp1Y = source[1] - arcHeight * 0.3;
      const cp2X = target[0] - (target[0] - midX) * 0.5;
      const cp2Y = target[1] - arcHeight * 0.3;

      const t = progress;
      const x = Math.pow(1 - t, 3) * source[0] +
                3 * Math.pow(1 - t, 2) * t * cp1X +
                3 * (1 - t) * Math.pow(t, 2) * cp2X +
                Math.pow(t, 3) * target[0];
      const y = Math.pow(1 - t, 3) * source[1] +
                3 * Math.pow(1 - t, 2) * t * cp1Y +
                3 * (1 - t) * Math.pow(t, 2) * cp2Y +
                Math.pow(t, 3) * target[1];
      return [x, y] as [number, number];
    }
  };

  // Function to update arc path on projection change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateArcPath = (arc: d3.Selection<SVGPathElement, unknown, null, undefined>, sourceId: string, targetId: string, projection: d3.GeoProjection) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const sourceCoord = coordinates[sourceId];
    const targetCoord = coordinates[targetId];

    if (sourceCoord && targetCoord) {
      const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
      const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

      if (sourcePoint && targetPoint) {
        const newPath = createDramaticGlobeArc(sourcePoint, targetPoint);
        arc.attr("d", newPath);
      }
    }
  };

  // Utility function to create a single animated attack arc
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const createAnimatedAttackArc = (
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    source: [number, number], // [longitude, latitude]
    target: [number, number], // [longitude, latitude]
    options: {
      id?: string;
      color?: string;
      strokeWidth?: number;
      curveType?: 'globe' | 'great-circle' | 'parabolic';
      animationDuration?: number;
      particleCount?: number;
      particleInterval?: number;
    } = {}
  ) => {
    const {
      id = `arc-${Date.now()}`,
      color = '#ff0000',
      strokeWidth = 3,
      curveType = 'globe',
      animationDuration = 2000,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      particleCount = 1,
      particleInterval = 1200
    } = options;

    const projection = d3.geoMercator()
      .translate([width / 2, height / 2])
      .scale((width - 1) / 2 / Math.PI);

    const sourcePoint = projection(source);
    const targetPoint = projection(target);

    if (!sourcePoint || !targetPoint) return null;

    // Create arc group
    const arcGroup = svg.select('.main-group').select('.attack-arcs');
    
    // Create the arc path
    const arcPath = arcGroup
      .append("path")
      .attr("class", `attack-arc ${id}`)
      .attr("d", createDramaticGlobeArc(sourcePoint, targetPoint, curveType))
      .style("fill", "none")
      .style("stroke", color)
      .style("stroke-width", strokeWidth)
      .style("opacity", 0.85)
      .style("filter", `drop-shadow(0 0 8px ${color}) blur(0.5px)`)
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round")
      .attr("data-arc-id", id);

    // Add flowing animation
    const pathElement = arcPath.node() as SVGPathElement;
    if (pathElement) {
      const pathLength = pathElement.getTotalLength();
      const dashLength = 15;
      const gapLength = 8;

      pathElement.style.strokeDasharray = `${dashLength},${gapLength}`;
      pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;

      const animateArc = () => {
        pathElement.style.transition = `stroke-dashoffset ${animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        pathElement.style.strokeDashoffset = `${-pathLength - dashLength}`;

        setTimeout(() => {
          pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;
          setTimeout(animateArc, 300);
        }, animationDuration);
      };

      animateArc();
    }

    // Add particle animation
    let particleId = 0;
    const spawnParticle = () => {
      const particle = arcGroup
        .append("circle")
        .attr("class", `attack-particle ${id}-${particleId}`)
        .attr("cx", sourcePoint[0])
        .attr("cy", sourcePoint[1])
        .attr("r", 1.5)
        .style("fill", color)
        .style("opacity", 0.8)
        .style("filter", `drop-shadow(0 0 3px ${color}) blur(0.3px)`)
        .style("pointer-events", "none");

      // Animate particle along arc
      const startTime = Date.now();
      const duration = 2500;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        if (progress < 1) {
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          const position = getPointAlongArc(sourcePoint, targetPoint, easeProgress, curveType);
          
          particle
            .attr("cx", position[0])
            .attr("cy", position[1])
            .style("opacity", 0.8 - progress * 0.3)
            .style("r", 1.5 + Math.sin(progress * Math.PI) * 0.5);

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
    const intervalId = setInterval(spawnParticle, particleInterval);

    // Return cleanup function
    return () => {
      clearInterval(intervalId);
      arcPath.remove();
      arcGroup.selectAll(`.attack-particle.${id}`).remove();
    };
  };

  // Function to add attack pointers (red glowing circles)
  const addAttackPointers = (mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>, projection: d3.GeoProjection) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create pointers group
    const pointersGroup = mainGroup.append("g")
      .attr("class", "attack-pointers");

    // Collect unique attack locations
    const attackLocations = new Set<string>();
    threats.attacks.forEach(attack => {
      attackLocations.add(attack.source);
      attackLocations.add(attack.target);
    });

    // Add pointers for each unique location
    attackLocations.forEach(countryId => {
      const coord = coordinates[countryId];
      if (coord) {
        const point = projection([coord.lng, coord.lat]);
        if (point) {
           // Create enhanced outlined red circle with multiple outlines
           const pointer = pointersGroup
             .append("circle")
             .attr("class", `attack-pointer ${countryId}`)
             .attr("cx", point[0])
             .attr("cy", point[1])
             .attr("r", 6) // Increased size
             .style("fill", "rgba(255, 0, 0, 0.3)") // Enhanced fill
             .style("stroke", "#ff0000")
             .style("stroke-width", "3px") // Increased stroke width
             .style("opacity", 1) // Full opacity
             .style("filter", "drop-shadow(0 0 8px #ff0000) drop-shadow(0 0 4px #ffffff)") // Enhanced glow with white outline
             .style("pointer-events", "none");

           // Add outer white outline circle for better visibility
           const outlinePointer = pointersGroup
             .append("circle")
             .attr("class", `attack-pointer-outline ${countryId}`)
             .attr("cx", point[0])
             .attr("cy", point[1])
             .attr("r", 8) // Slightly larger than main pointer
             .style("fill", "none")
             .style("stroke", "#ffffff")
             .style("stroke-width", "1px")
             .style("opacity", 0.8)
             .style("filter", "drop-shadow(0 0 2px #ffffff)")
             .style("pointer-events", "none");

          // Add more dramatic pulsing animation for both pointer and outline
          const animatePulse = () => {
            pointer
              .transition()
              .duration(1500) // Faster animation
              .attr("r", 10) // Larger pulse
              .style("opacity", 0.4)
              .transition()
              .duration(1500)
              .attr("r", 6)
              .style("opacity", 1)
              .on("end", animatePulse);

            // Animate the outline pointer as well
            outlinePointer
              .transition()
              .duration(1500)
              .attr("r", 12) // Outline grows with main pointer
              .style("opacity", 0.3)
              .transition()
              .duration(1500)
              .attr("r", 8)
              .style("opacity", 0.8)
              .on("end", () => {}); // Outline animation follows main pointer
          };

          animatePulse();
        }
      }
    });
  };

  // Function to add animated attack arcs
  const addAnimatedAttackArcs = (mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>, projection: d3.GeoProjection, tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>, svgElement: SVGSVGElement) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create arcs group
    const arcsGroup = mainGroup.append("g")
      .attr("class", "attack-arcs");

    // Create gradient definitions for professional arc styling
    const defs = svgElement.querySelector('defs') || svgElement.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svgElement.firstChild);
    
    // Create gradients for different severity levels
    const createGradient = (id: string, color1: string, color2: string) => {
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      gradient.setAttribute('id', id);
      gradient.setAttribute('x1', '0%');
      gradient.setAttribute('y1', '0%');
      gradient.setAttribute('x2', '100%');
      gradient.setAttribute('y2', '0%');
      
      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', color1);
      stop1.setAttribute('stop-opacity', '0.8');
      
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', color2);
      stop2.setAttribute('stop-opacity', '0.4');
      
      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      defs.appendChild(gradient);
    };

    // Create professional gradients for each severity
    createGradient('critical-gradient', '#ff0000', '#ff6666');
    createGradient('high-gradient', '#ff6600', '#ff9933');
    createGradient('medium-gradient', '#ffaa00', '#ffcc66');
    createGradient('low-gradient', '#00aa00', '#66cc66');

    // Add animated arcs for each attack
    threats.attacks.forEach((attack, index) => {
      const sourceCoord = coordinates[attack.source];
      const targetCoord = coordinates[attack.target];

      if (sourceCoord && targetCoord) {
        const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
        const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

        if (sourcePoint && targetPoint) {
          const severity = threats.severityLevels[attack.severity];

                 // Create professional animated arc with gradient and enhanced styling
                 const arcPath = arcsGroup
                   .append("path")
                   .attr("class", `attack-arc attack-${attack.severity}`)
                   .attr("d", createDramaticGlobeArc(sourcePoint, targetPoint, 'parabolic')) // Use parabolic for more dramatic curves
                   .style("fill", "none")
                   .style("stroke", `url(#${attack.severity}-gradient)`)
                   .style("stroke-width", Math.max(severity.strokeWidth, 4)) // Increased minimum width
                   .style("opacity", 0.9) // Increased opacity
                   .style("filter", `drop-shadow(0 0 12px ${severity.color}) blur(0.8px)`) // Enhanced glow
                   .style("stroke-linecap", "round")
                   .style("stroke-linejoin", "round")
                   .attr("data-attack-id", attack.id)
                   .attr("data-source", attack.source)
                   .attr("data-target", attack.target)
                   .attr("data-type", attack.type)
                   .attr("data-description", attack.description);

                 // Add professional flowing arc animation
                 const pathElement = arcPath.node() as SVGPathElement;
                 if (pathElement) {
                   const pathLength = pathElement.getTotalLength();

                   // Professional dash pattern based on severity
                   const dashConfig = {
                     critical: { dash: 20, gap: 6 },
                     high: { dash: 16, gap: 8 },
                     medium: { dash: 12, gap: 10 },
                     low: { dash: 8, gap: 12 }
                   };
                   
                   const config = dashConfig[attack.severity as keyof typeof dashConfig] || dashConfig.medium;
                   const dashLength = config.dash;
                   const gapLength = config.gap;

                   // Set initial dash pattern
                   pathElement.style.strokeDasharray = `${dashLength},${gapLength}`;
                   pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;

                   // Professional arc animation with easing
                   const animateArc = () => {
                     pathElement.style.transition = `stroke-dashoffset ${2000 + index * 100}ms cubic-bezier(0.4, 0, 0.2, 1)`;
                     pathElement.style.strokeDashoffset = `${-pathLength - dashLength}`;

                     // Restart animation with slight delay
                     setTimeout(() => {
                       pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;
                       setTimeout(animateArc, 300 + index * 50);
                     }, 2000 + index * 100);
                   };

                   // Start arc animation with staggered delay
                   setTimeout(animateArc, index * 200);
            
                   // Create professional particle stream
                   const createParticleStream = () => {
                     let particleId = 0;
                     const streamInterval = 1200; // Optimized timing

                     const spawnParticle = () => {
                       const particle = arcsGroup
                         .append("circle")
                         .attr("class", `attack-particle ${attack.id}-${particleId}`)
                         .attr("cx", sourcePoint[0])
                         .attr("cy", sourcePoint[1])
                         .attr("r", 3) // Increased particle size
                         .style("fill", severity.color)
                         .style("opacity", 1) // Increased opacity
                         .style("filter", `drop-shadow(0 0 6px ${severity.color}) blur(0.5px)`) // Enhanced glow
                         .style("pointer-events", "none");

                // Animate this particle along the arc
                const animateParticle = () => {
                  const startTime = Date.now();
                  const duration = 2500; // Fixed duration for consistent flow
                  
                  const animate = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                           if (progress < 1) {
                             // Easing function for smooth movement
                             const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic

                             // Use the new getPointAlongArc function for parabolic curves
                             const position = getPointAlongArc(sourcePoint, targetPoint, easeProgress, 'parabolic');

                             // Update particle position with enhanced effects
                             particle
                               .attr("cx", position[0])
                               .attr("cy", position[1])
                               .style("opacity", 1 - progress * 0.4) // Enhanced fade
                               .style("r", 3 + Math.sin(progress * Math.PI) * 1.5); // More dramatic pulse
                      
                      requestAnimationFrame(animate);
                    } else {
                      // Particle reached target - remove it
                      particle.remove();
                    }
                  };
                  
                  animate();
                };
                
                // Start this particle's animation
                animateParticle();
                particleId++;
              };
              
              // Start spawning particles
              spawnParticle(); // First particle
              
              // Continue spawning particles at intervals
              const intervalId = setInterval(spawnParticle, streamInterval);
              
              // Store interval ID for cleanup
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (arcsGroup.node() as any).__particleInterval = intervalId;
            };
            
            // Start the particle stream with delay
            setTimeout(createParticleStream, index * 300);
          }

                 // Professional hover effects
                 arcPath
                   .on("mouseover", function(event) {
                     d3.select(this)
                       .style("opacity", 1)
                       .style("stroke-width", Math.max(severity.strokeWidth, 3) * 1.8)
                       .style("filter", `drop-shadow(0 0 12px ${severity.color}) blur(0.8px)`);

                     const [mouseX, mouseY] = d3.pointer(event, svgElement);

                     tooltip
                       .style("display", "block")
                       .style("left", `${mouseX + 15}px`)
                       .style("top", `${mouseY - 50}px`)
                       .style("background", "rgba(0, 0, 0, 0.9)")
                       .style("color", "#ffffff")
                       .style("border", `2px solid ${severity.color}`)
                       .style("border-radius", "8px")
                       .style("padding", "12px")
                       .style("font-size", "13px")
                       .style("box-shadow", `0 4px 20px rgba(0, 0, 0, 0.3), 0 0 20px ${severity.color}40`)
                       .html(`
                         <div style="font-weight: bold; color: ${severity.color}; font-size: 14px; margin-bottom: 8px;">${attack.type}</div>
                         <div style="margin: 4px 0; color: #e0e0e0;">From: <strong style="color: #ffffff;">${sourceCoord.name}</strong></div>
                         <div style="margin: 4px 0; color: #e0e0e0;">To: <strong style="color: #ffffff;">${targetCoord.name}</strong></div>
                         <div style="margin: 4px 0; color: #e0e0e0;">Severity: <span style="color: ${severity.color}; font-weight: bold;">${attack.severity.toUpperCase()}</span></div>
                         <div style="margin-top: 10px; font-size: 12px; line-height: 1.4; color: #cccccc; border-top: 1px solid #444; padding-top: 8px;">${attack.description}</div>
                       `);
                   })
                   .on("mouseout", function() {
                     d3.select(this)
                       .style("opacity", 0.85)
                       .style("stroke-width", Math.max(severity.strokeWidth, 3))
                       .style("filter", `drop-shadow(0 0 8px ${severity.color}) blur(0.5px)`);

                     tooltip.style("display", "none");
                   });
        }
      }
    });
  };

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: '#1a1a1a'
    }}>
      <svg 
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%' }}
      />
       <div
         ref={tooltipRef}
         style={{
           color: '#ffffff',
           backgroundColor: '#2a2a2a',
           padding: '0.5em',
           textShadow: 'none',
           borderRadius: '4px',
           opacity: 0.95,
           position: 'absolute',
           pointerEvents: 'none',
           fontSize: '13px',
           zIndex: 1000,
           boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
           border: '1px solid #444444',
           display: 'none'
         }}
       />
    </div>
  );
};

export default SimpleWorldMap;
