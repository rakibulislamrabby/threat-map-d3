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

    // Set up zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on("zoom", (event) => {
        const { transform } = event;
        svg.selectAll('.countries-group')
          .attr("transform", transform.toString());
        
        // Update attack arcs when projection changes
        svg.selectAll('.attack-arc')
          .each(function() {
            const arc = d3.select(this as SVGPathElement);
            const sourceId = arc.attr('data-source');
            const targetId = arc.attr('data-target');
            if (sourceId && targetId) {
              updateArcPath(arc, sourceId, targetId, projection);
            }
          });
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
    const countries = topojson.feature(worldData as any, worldData.objects.world_subunits as any);

    // Create countries group
    const countriesGroup = svg.append("g")
      .attr("class", "countries-group");

    // Add countries - ALL SAME GRAY COLOR with hover border effect
    countriesGroup.selectAll(".subunit")
      .data((countries as any).features)
      .enter()
      .append("path")
      .attr("class", (d) => {
        const feature = d as CountryFeature;
        return `subunit-boundary subunit gray-country ${feature.id}`;
      })
      .style("fill", "#cccccc") // All countries same gray color
      .style("stroke", "#999999")
      .style("stroke-width", "1px")
      .style("stroke-linejoin", "round")
      .attr("d", path as any)
      .on("mouseover", function(event, d) {
        const feature = d as CountryFeature;
        
        // Change border color on hover
        d3.select(this)
          .style("stroke", "#0f22f2")
          .style("stroke-width", "2px");
        
        // Show tooltip with country name
        const [mouseX, mouseY] = d3.pointer(event, svg.node());
        
        tooltip
          .style("display", "block")
          .style("left", `${mouseX + 5}px`)
          .style("top", `${mouseY - 25}px`)
          .html(`<p>${feature.properties.name}</p>`);
      })
      .on("mouseout", function() {
        // Reset border color
        d3.select(this)
          .style("stroke", "#999999")
          .style("stroke-width", "1px");
        
        tooltip.style("display", "none");
      });

    // Add animated attack arcs
    addAnimatedAttackArcs(svg, projection, tooltip);

    // Cleanup function
    return () => {
      // Clear all animations and particles
      svg.selectAll('.attack-particle').remove();
      svg.selectAll('.attack-arc').remove();
    };
  }, []);

  // Function to create simple straight line from source to target
  const createSimpleArcPath = (source: [number, number], target: [number, number]) => {
    // Simple straight line from source to target
    return `M${source[0]},${source[1]}L${target[0]},${target[1]}`;
  };

  // Function to update arc path on projection change
  const updateArcPath = (arc: d3.Selection<SVGPathElement, unknown, null, undefined>, sourceId: string, targetId: string, projection: d3.GeoProjection) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const sourceCoord = coordinates[sourceId];
    const targetCoord = coordinates[targetId];

    if (sourceCoord && targetCoord) {
      const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
      const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

      if (sourcePoint && targetPoint) {
        const newPath = createSimpleArcPath(sourcePoint, targetPoint);
        arc.attr("d", newPath);
      }
    }
  };

  // Function to add animated attack arcs
  const addAnimatedAttackArcs = (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, projection: d3.GeoProjection, tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create arcs group
    const arcsGroup = svg.append("g")
      .attr("class", "attack-arcs");

    // Add animated arcs for each attack
    threats.attacks.forEach((attack, index) => {
      const sourceCoord = coordinates[attack.source];
      const targetCoord = coordinates[attack.target];

      if (sourceCoord && targetCoord) {
        const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
        const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

        if (sourcePoint && targetPoint) {
          const severity = threats.severityLevels[attack.severity];

          // Create animated straight line arc
          const arcPath = arcsGroup
            .append("path")
            .attr("class", `attack-arc attack-${attack.severity}`)
            .attr("d", createSimpleArcPath(sourcePoint, targetPoint))
            .style("fill", "none")
            .style("stroke", severity.color)
            .style("stroke-width", severity.strokeWidth)
            .style("opacity", 0.8)
            .attr("data-attack-id", attack.id)
            .attr("data-source", attack.source)
            .attr("data-target", attack.target)
            .attr("data-type", attack.type)
            .attr("data-description", attack.description);

          // Add flowing particle animation like globe apps
          const pathElement = arcPath.node() as SVGPathElement;
          if (pathElement) {
            const pathLength = pathElement.getTotalLength();
            
            // Create multiple particles for flowing effect
            const particleCount = 3;
            for (let i = 0; i < particleCount; i++) {
              const particle = arcsGroup
                .append("circle")
                .attr("class", `attack-particle ${attack.id}`)
                .attr("cx", sourcePoint[0])
                .attr("cy", sourcePoint[1])
                .attr("r", 2)
                .style("fill", severity.color)
                .style("opacity", 0.8)
                .style("filter", `drop-shadow(0 0 4px ${severity.color})`)
                .style("pointer-events", "none");

              // Animate particle along the path (globe-style)
              const animateParticle = () => {
                const startTime = Date.now();
                const duration = 2000 + Math.random() * 1000; // 2-3 seconds
                const delay = i * 800; // Stagger particles
                
                const animate = () => {
                  const elapsed = Date.now() - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  
                  if (progress < 1) {
                    // Easing function for smooth movement
                    const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
                    
                    // Calculate position along the line
                    const x = sourcePoint[0] + (targetPoint[0] - sourcePoint[0]) * easeProgress;
                    const y = sourcePoint[1] + (targetPoint[1] - sourcePoint[1]) * easeProgress;
                    
                    // Update particle position with glow effect
                    particle
                      .attr("cx", x)
                      .attr("cy", y)
                      .style("opacity", 0.9 - progress * 0.4) // Fade out as it travels
                      .style("r", 2 + Math.sin(progress * Math.PI) * 1); // Pulse size
                    
                    requestAnimationFrame(animate);
                  } else {
                    // Reset particle to start
                    particle
                      .attr("cx", sourcePoint[0])
                      .attr("cy", sourcePoint[1])
                      .style("opacity", 0)
                      .style("r", 2);
                    
                    // Restart animation after delay
                    setTimeout(() => {
                      particle.style("opacity", 0.9);
                      animateParticle();
                    }, delay);
                  }
                };
                
                // Start animation with delay
                setTimeout(animate, delay);
              };
              
              // Start particle animation
              setTimeout(animateParticle, index * 200 + i * 500);
            }
          }

          // Hover effects
          arcPath
            .on("mouseover", function(event) {
              d3.select(this)
                .style("opacity", 1)
                .style("stroke-width", severity.strokeWidth * 1.5);

              const [mouseX, mouseY] = d3.pointer(event, svg.node());

              tooltip
                .style("display", "block")
                .style("left", `${mouseX + 10}px`)
                .style("top", `${mouseY - 40}px`)
                .html(`
                  <div style="font-weight: bold; color: ${severity.color};">${attack.type}</div>
                  <div style="margin: 3px 0;">From: <strong>${sourceCoord.name}</strong></div>
                  <div style="margin: 3px 0;">To: <strong>${targetCoord.name}</strong></div>
                  <div style="margin: 3px 0;">Severity: <span style="color: ${severity.color};">${attack.severity.toUpperCase()}</span></div>
                  <div style="margin-top: 8px; font-size: 11px; line-height: 1.3;">${attack.description}</div>
                `);
            })
            .on("mouseout", function() {
              d3.select(this)
                .style("opacity", 0.8)
                .style("stroke-width", severity.strokeWidth);

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
      background: '#ffffff'
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
          color: '#222',
          backgroundColor: '#fff',
          padding: '0.5em',
          textShadow: '#f5f5f5 0 1px 0',
          borderRadius: '2px',
          opacity: 0.9,
          position: 'absolute',
          pointerEvents: 'none',
          fontSize: '13px',
          zIndex: 1000,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'none'
        }}
      />
    </div>
  );
};

export default SimpleWorldMap;
