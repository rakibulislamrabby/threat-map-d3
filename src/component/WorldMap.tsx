'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { gsap } from 'gsap';
import colorData from '../data/randomcountries.json';
import worldData from '../data/world.json';
import countryCoordinates from '../data/countryCoordinates.json';
import threatData from '../data/threatData.json';

// Type definitions for better type safety
interface CountryFeature {
  id: string;
  properties: {
    name: string;
  };
}

interface CountryColorData {
  [key: string]: number;
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

interface ThreatHub {
  id: string;
  country: string;
  name: string;
  type: 'primary' | 'secondary';
  importance: number;
}

interface ThreatData {
  hubs: ThreatHub[];
  attacks: ThreatAttack[];
  threatTypes: {
    [key: string]: {
      color: string;
      priority: number;
    };
  };
  severityLevels: {
    [key: string]: {
      color: string;
      strokeWidth: number;
    };
  };
}

const WorldMap: React.FC = () => {
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

    // Set up zoom behavior - zoom only, no pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .filter((event) => {
        // Only allow wheel events (zoom), block drag events (pan)
        return event.type === 'wheel';
      })
      .on("zoom", (event) => {
        const { transform } = event;
        // Always zoom from center, ignore any translation
        const centerTransform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(transform.k)
          .translate(-width / 2, -height / 2);
        
        svg.selectAll('.countries-group')
          .attr("transform", centerTransform.toString());
        
        // Adjust stroke width based on zoom level
        svg.selectAll("path")
          .style("stroke-width", `${1 / transform.k}px`);
      });

    // Apply zoom to svg
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

    // Create countries group
    const countriesGroup = svg.append("g")
      .attr("class", "countries-group");

    // Add countries
    countriesGroup.selectAll(".subunit")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .data((countries as any).features)
      .enter()
      .append("path")
      .attr("class", (d) => {
        const feature = d as CountryFeature;
        return `subunit-boundary subunit Group${(colorData as CountryColorData)[feature.id] || 0} ${feature.id}`;
      })
      .style("fill", (d) => {
        const feature = d as CountryFeature;
        const groupNum = (colorData as CountryColorData)[feature.id] || 0;
        const colors = ['#000000', '#F5E9CA', '#6DA690', '#BAC366', '#FE4D57', '#1D0463'];
        return colors[groupNum];
      })
      .style("stroke", "#777")
      .style("stroke-width", "1px")
      .style("stroke-linejoin", "round")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr("d", path as any)
      .on("mouseover", function(event, d) {
        const feature = d as CountryFeature;
        
        // Change country color to black on hover
        d3.select(this)
          .style("fill", "#000000");
        
        // Show tooltip with country name only - at mouse position relative to SVG
        const [mouseX, mouseY] = d3.pointer(event, svg.node());
        
        tooltip
          .style("display", "block")
          .style("left", `${mouseX + 5}px`)
          .style("top", `${mouseY - 25}px`)
          .html(`<p>${feature.properties.name}</p>`);
      })
      .on("mouseout", function(event, d) {
        const feature = d as CountryFeature;
        
        // Restore original color
        const groupNum = (colorData as CountryColorData)[feature.id] || 0;
        const colors = ['#000000', '#F5E9CA', '#6DA690', '#BAC366', '#FE4D57', '#1D0463'];
        
        d3.select(this)
          .style("fill", colors[groupNum]);
        
        // Hide tooltip
        tooltip.style("display", "none");
      });

    // Add threat map functionality
    addThreatArcs(svg, projection);
    addThreatLegend(svg);
    addAttackCounter(svg);
    startThreatAnimation(svg);
  }, []);

  // Function to create dramatic archer-like curved paths between countries
  const createArcPath = (source: [number, number], target: [number, number]) => {
    const dx = target[0] - source[0];
    const dy = target[1] - source[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Create higher, more dramatic arc for longer distances
    const baseHeight = distance * 0.3;
    const arcHeight = Math.min(baseHeight, 200); // Maximum arc height
    
    // Calculate control point for quadratic curve
    const midX = (source[0] + target[0]) / 2;
    const midY = (source[1] + target[1]) / 2 - arcHeight;
    
    // Create smooth quadratic curve (more archer-like)
    return `M${source[0]},${source[1]}Q${midX},${midY} ${target[0]},${target[1]}`;
  };

  // Function to add threat arcs to the map
  const addThreatArcs = (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, projection: d3.GeoProjection) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create arcs group
    const arcsGroup = svg.append("g")
      .attr("class", "threat-arcs");

    // Add arcs for each attack
    threats.attacks.forEach((attack, index) => {
      const sourceCoord = coordinates[attack.source];
      const targetCoord = coordinates[attack.target];

      if (sourceCoord && targetCoord) {
        const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
        const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

        if (sourcePoint && targetPoint) {
          const severity = threats.severityLevels[attack.severity];

          // Create arc path with smooth flowing animation
          const arcPath = arcsGroup
            .append("path")
            .attr("class", `threat-arc threat-${attack.severity}`)
            .attr("d", createArcPath(sourcePoint, targetPoint))
            .style("fill", "none")
            .style("stroke", severity.color)
            .style("stroke-width", severity.strokeWidth)
            .style("opacity", 0.8)
            .style("filter", "drop-shadow(0 0 3px rgba(255,0,0,0.6))")
            .style("stroke-dasharray", "10,5")
            .style("stroke-dashoffset", 0)
            .attr("data-attack-id", attack.id)
            .attr("data-source", sourceCoord.name)
            .attr("data-target", targetCoord.name)
            .attr("data-type", attack.type)
            .attr("data-description", attack.description);

          // Smooth flowing dash animation like ReactGlobe
          const pathElement = arcPath.node();
          if (pathElement) {
            // Calculate path length for smooth animation
            const pathLength = pathElement.getTotalLength();
            const dashLength = 15;
            const gapLength = 8;
            
            // Set initial dash offset
            gsap.set(pathElement, { 
              strokeDasharray: `${dashLength},${gapLength}`,
              strokeDashoffset: pathLength + dashLength
            });
            
            // Create smooth flowing animation
            gsap.timeline({ delay: index * 0.3 })
              .to(pathElement, {
                strokeDashoffset: -pathLength - dashLength,
                duration: 2.5 + Math.random() * 1, // Vary speed like ReactGlobe
                ease: "none", // Linear for smooth flow
                repeat: -1
              });
            
            // Add subtle opacity pulse
            gsap.to(pathElement, {
              opacity: 0.4,
              duration: 1.5,
              ease: "power2.inOut",
              repeat: -1,
              yoyo: true,
              delay: index * 0.2
            });

          // Add traveling particle effect along the arc
          addTravelingParticle(arcsGroup, sourcePoint, targetPoint, severity.color, index);
          }

          // Enhanced hover effects with GSAP
          arcPath
            .on("mouseover", function(event) {
              // eslint-disable-next-line @typescript-eslint/no-this-alias
              const element = this;
              
              // Smooth hover animation with GSAP
              gsap.to(element, {
                opacity: 1,
                scale: 1.1,
                duration: 0.3,
                ease: "power2.out"
              });
              
              // Smooth stroke width animation
              gsap.to(element, {
                attr: { "stroke-width": severity.strokeWidth * 2 },
                duration: 0.2,
                ease: "power1.out"
              });

              const tooltip = d3.select(tooltipRef.current);
              const [mouseX, mouseY] = d3.pointer(event, svg.node());

              // Animate tooltip appearance
              tooltip
                .style("display", "block")
                .style("left", `${mouseX + 10}px`)
                .style("top", `${mouseY - 40}px`)
                .style("opacity", 0)
                .html(`
                  <div style="font-weight: bold; color: ${severity.color}; text-shadow: 0 0 5px ${severity.color};">${attack.type}</div>
                  <div style="margin: 3px 0;">From: <strong>${sourceCoord.name}</strong></div>
                  <div style="margin: 3px 0;">To: <strong>${targetCoord.name}</strong></div>
                  <div style="margin: 3px 0;">Severity: <span style="color: ${severity.color};">${attack.severity.toUpperCase()}</span></div>
                  <div style="margin-top: 8px; font-size: 11px; line-height: 1.3;">${attack.description}</div>
                `);
              
              // Animate tooltip fade in
              gsap.to(tooltip.node(), {
                opacity: 1,
                y: -5,
                duration: 0.2,
                ease: "power1.out"
              });
            })
            .on("mouseout", function() {
              // eslint-disable-next-line @typescript-eslint/no-this-alias
              const element = this;
              
              // Smooth hover out animation
              gsap.to(element, {
                opacity: 0.2,
                scale: 1,
                duration: 0.3,
                ease: "power2.out"
              });
              
              gsap.to(element, {
                attr: { "stroke-width": severity.strokeWidth },
                duration: 0.2,
                ease: "power1.out"
              });

              // Animate tooltip fade out
              const tooltipNode = d3.select(tooltipRef.current).node();
              gsap.to(tooltipNode, {
                opacity: 0,
                y: 5,
                duration: 0.15,
                ease: "power1.in",
                onComplete: () => {
                  d3.select(tooltipRef.current).style("display", "none");
                }
              });
            });
        }
      }
    });

    // Add enhanced hub markers and regular threat markers
    addThreatHubs(arcsGroup, coordinates, threats, projection);
    addThreatMarkers(arcsGroup, coordinates, threats, projection);
  };

  // Function to add smooth traveling particle effect like ReactGlobe
  const addTravelingParticle = (
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    sourcePoint: [number, number],
    targetPoint: [number, number],
    color: string,
    index: number
  ) => {
    // Create multiple particles for smoother effect
    for (let i = 0; i < 3; i++) {
      const particle = group
        .append("circle")
        .attr("class", "traveling-particle")
        .attr("cx", sourcePoint[0])
        .attr("cy", sourcePoint[1])
        .attr("r", 1.5 + Math.random() * 1)
        .style("fill", color)
        .style("opacity", 0)
        .style("filter", `drop-shadow(0 0 6px ${color})`);

      const particleElement = particle.node();
      if (particleElement) {
        // Calculate smooth arc path using quadratic curve
        const dx = targetPoint[0] - sourcePoint[0];
        const dy = targetPoint[1] - sourcePoint[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        const arcHeight = Math.min(distance * 0.3, 150);
        
        const midX = (sourcePoint[0] + targetPoint[0]) / 2;
        const midY = (sourcePoint[1] + targetPoint[1]) / 2 - arcHeight;
        
        // Create smooth flowing animation
        const tl = gsap.timeline({ 
          repeat: -1, 
          delay: index * 0.4 + i * 0.2,
          ease: "none"
        });
        
        // Animate along the arc path with smooth bezier curve
        tl.to(particleElement, {
          attr: { cx: midX, cy: midY },
          duration: 1.25 + Math.random() * 0.5,
          ease: "power2.out"
        })
        .to(particleElement, {
          attr: { cx: targetPoint[0], cy: targetPoint[1] },
          duration: 1.25 + Math.random() * 0.5,
          ease: "power2.in"
        })
        .set(particleElement, {
          attr: { cx: sourcePoint[0], cy: sourcePoint[1] }
        });

        // Add smooth opacity animation
        gsap.to(particleElement, {
          opacity: 0.8,
          duration: 0.3,
          ease: "power2.out",
          delay: index * 0.4 + i * 0.2
        });
        
        gsap.to(particleElement, {
          opacity: 0.2,
          duration: 0.3,
          ease: "power2.in",
          delay: index * 0.4 + i * 0.2 + 2.2
        });
      }
    }
  };

  // Function to add enhanced threat hubs (major targets like Singapore, USA, Netherlands)
  const addThreatHubs = (
    arcsGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    coordinates: { [key: string]: CountryCoordinate },
    threats: ThreatData,
    projection: d3.GeoProjection
  ) => {
    threats.hubs.forEach((hub, index) => {
      const coord = coordinates[hub.country];
      if (coord) {
        const point = projection([coord.lng, coord.lat]);
        if (point) {
          // Create hub group for layered effects
          const hubGroup = arcsGroup.append("g").attr("class", "threat-hub");

          // Add large pulsing base circle
          const baseCircle = hubGroup
            .append("circle")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 0)
            .style("fill", hub.type === 'primary' ? "#ff0000" : "#ff8800")
            .style("opacity", 0.3)
            .style("filter", "drop-shadow(0 0 12px rgba(255,0,0,0.8))");

          // Add central hub marker
          const centralHub = hubGroup
            .append("circle")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 0)
            .style("fill", "#ffffff")
            .style("stroke", hub.type === 'primary' ? "#ff0000" : "#ff8800")
            .style("stroke-width", 3)
            .style("opacity", 0)
            .style("filter", "drop-shadow(0 0 8px rgba(255,255,255,0.9))");

          // Add hub label
          const label = hubGroup
            .append("text")
            .attr("x", point[0])
            .attr("y", point[1] - 25)
            .style("fill", "#ffffff")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("text-anchor", "middle")
            .style("opacity", 0)
            .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.8)")
            .text(coord.name);

          // Animate hub entrance
          gsap.timeline({ delay: index * 0.5 })
            .to(baseCircle.node(), {
              attr: { r: hub.importance * 4 },
              duration: 1,
              ease: "back.out(1.7)"
            })
            .to(centralHub.node(), {
              attr: { r: 6 },
              opacity: 1,
              duration: 0.5,
              ease: "power2.out"
            }, "-=0.5")
            .to(label.node(), {
              opacity: 1,
              duration: 0.3,
              ease: "power1.out"
            }, "-=0.2");

          // Add continuous pulsing for primary hubs
          if (hub.type === 'primary') {
            gsap.to(baseCircle.node(), {
              scale: 1.2,
              opacity: 0.1,
              duration: 2,
              ease: "power2.inOut",
              repeat: -1,
              yoyo: true
            });

            // Add rotating rings for primary hubs
            for (let i = 0; i < 3; i++) {
              const ring = hubGroup
                .append("circle")
                .attr("cx", point[0])
                .attr("cy", point[1])
                .attr("r", 15 + i * 8)
                .style("fill", "none")
                .style("stroke", "#ff0000")
                .style("stroke-width", 1)
                .style("opacity", 0.2)
                .style("stroke-dasharray", "5,10");

              gsap.to(ring.node(), {
                rotation: 360,
                duration: 10 + i * 2,
                ease: "none",
                repeat: -1,
                transformOrigin: `${point[0]}px ${point[1]}px`
              });
            }
          }

          // Add hub interaction
          hubGroup
            .style("cursor", "pointer")
            .on("mouseover", function() {
              gsap.to(centralHub.node(), {
                scale: 1.5,
                duration: 0.2,
                ease: "power2.out"
              });
              gsap.to(label.node(), {
                scale: 1.2,
                duration: 0.2,
                ease: "power2.out"
              });
            })
            .on("mouseout", function() {
              gsap.to([centralHub.node(), label.node()], {
                scale: 1,
                duration: 0.2,
                ease: "power2.out"
              });
            });
        }
      }
      });
  };

  // Function to add threat markers (source/target points)
  const addThreatMarkers = (
    arcsGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    coordinates: { [key: string]: CountryCoordinate },
    threats: ThreatData,
    projection: d3.GeoProjection
  ) => {
    const attackPoints = new Set<string>();
    
    // Collect all source and target countries
    threats.attacks.forEach(attack => {
      attackPoints.add(attack.source);
      attackPoints.add(attack.target);
    });

    // Add markers for each country involved in attacks
    attackPoints.forEach(countryCode => {
      const coord = coordinates[countryCode];
      if (coord) {
        const point = projection([coord.lng, coord.lat]);
        if (point) {
          // Add enhanced pulsing marker with GSAP
          const marker = arcsGroup
            .append("circle")
            .attr("class", "threat-marker")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 0)
            .style("fill", "#ff0000")
            .style("stroke", "#ffffff")
            .style("stroke-width", 2)
            .style("opacity", 0)
            .style("filter", "drop-shadow(0 0 8px rgba(255,0,0,0.8))");

          const markerElement = marker.node();
          if (markerElement) {
            // Smooth entrance animation
            gsap.to(markerElement, {
              attr: { r: 4 },
              opacity: 0.9,
              duration: 0.8,
              delay: Math.random() * 2,
              ease: "back.out(1.7)"
            });

            // Continuous pulsing with GSAP for smoother effect
            gsap.to(markerElement, {
              scale: 1.4,
              opacity: 0.4,
              duration: 1,
              ease: "power2.inOut",
              repeat: -1,
              yoyo: true,
              delay: Math.random() * 1
            });
          }

          // Add outer ring effect
          const outerRing = arcsGroup
            .append("circle")
            .attr("class", "threat-marker-ring")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 0)
            .style("fill", "none")
            .style("stroke", "#ff0000")
            .style("stroke-width", 1)
            .style("opacity", 0);

          const ringElement = outerRing.node();
          if (ringElement) {
            // Expanding ring animation with GSAP
            gsap.fromTo(ringElement, 
              {
                attr: { r: 0, "stroke-width": 3 },
                opacity: 0
              },
              {
                attr: { r: 12, "stroke-width": 0 },
                opacity: 0.6,
                duration: 3,
                ease: "power2.out",
                repeat: -1,
                delay: Math.random() * 2,
                onComplete: function() {
                  gsap.set(this.targets()[0], { attr: { r: 0 }, opacity: 0 });
                }
              }
            );
          }
        }
      }
    });
  };

  // Enhanced continuous threat animation with smooth flowing effects
  const startThreatAnimation = (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) => {
    const threatArcs = svg.selectAll(".threat-arc").nodes();
    
    // Create smooth flowing animations for each arc
    threatArcs.forEach((arc, index) => {
      if (arc) {
        // Add subtle breathing effect to each arc
        gsap.to(arc, {
          opacity: 0.6,
          duration: 2 + Math.random() * 1,
          ease: "power2.inOut",
          repeat: -1,
          yoyo: true,
          delay: index * 0.1
        });
        
        // Add subtle scale pulsing
        gsap.to(arc, {
          scale: 1.02,
          duration: 3 + Math.random() * 1,
          ease: "power1.inOut",
          repeat: -1,
          yoyo: true,
          delay: index * 0.15
        });
      }
    });

    // Add periodic flash effect for high-priority threats
    gsap.to(".threat-critical", {
      opacity: 1,
      duration: 0.2,
      ease: "power2.out",
      repeat: -1,
      repeatDelay: 4 + Math.random() * 2,
      yoyo: true
    });

    // Add subtle breathing effect to the entire threat layer
    gsap.to(".threat-arcs", {
      scale: 1.01,
      duration: 6,
      ease: "power1.inOut",
      repeat: -1,
      yoyo: true
    });
  };

  // Function to add threat legend
  const addThreatLegend = (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) => {
    const threats = threatData as ThreatData;
    
    // Create legend group
    const legend = svg.append("g")
      .attr("class", "threat-legend")
      .attr("transform", "translate(20, 20)");

    // Add enhanced legend background with smooth entrance
    const legendBg = legend.append("rect")
      .attr("x", -10)
      .attr("y", -10)
      .attr("width", 0)
      .attr("height", 180)
      .style("fill", "rgba(0, 0, 0, 0.9)")
      .style("stroke", "#ff0000")
      .style("stroke-width", 1)
      .style("stroke-dasharray", "5,5")
      .style("rx", 8)
      .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.6))");

    // Animate legend background entrance
    gsap.to(legendBg.node(), {
      attr: { width: 230 },
      duration: 1,
      ease: "power2.out",
      delay: 1
    });

    // Add glowing border animation with GSAP
    gsap.to(legendBg.node(), {
      attr: { "stroke-dashoffset": -20 },
      duration: 2,
      ease: "none",
      repeat: -1
    });

    // Add legend title
    legend.append("text")
      .attr("x", 0)
      .attr("y", 0)
      .style("fill", "white")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Cyber Threats");

    // Add severity levels
    const severityLevels = Object.entries(threats.severityLevels);
    severityLevels.forEach(([level, config], index) => {
      const y = 20 + index * 20;
      
      // Add line sample
      legend.append("line")
        .attr("x1", 0)
        .attr("y1", y)
        .attr("x2", 20)
        .attr("y2", y)
        .style("stroke", config.color)
        .style("stroke-width", config.strokeWidth);

      // Add text
      legend.append("text")
        .attr("x", 25)
        .attr("y", y + 4)
        .style("fill", "white")
        .style("font-size", "11px")
        .text(`${level.toUpperCase()} Severity`);
    });

    // Add threat types (top 6)
    const topThreatTypes = Object.entries(threats.threatTypes)
      .sort((a, b) => b[1].priority - a[1].priority)
      .slice(0, 6);

    topThreatTypes.forEach(([type, config], index) => {
      const y = 110 + index * 15;
      
      // Add color indicator
      legend.append("circle")
        .attr("cx", 5)
        .attr("cy", y)
        .attr("r", 3)
        .style("fill", config.color);

      // Add text
      legend.append("text")
        .attr("x", 15)
        .attr("y", y + 4)
        .style("fill", "white")
        .style("font-size", "10px")
        .text(type);
    });
  };

  // Function to add attack counter display
  const addAttackCounter = (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) => {
    const threats = threatData as ThreatData;
    const totalAttacks = threats.attacks.length;
    
    // Create counter group
    const counterGroup = svg.append("g")
      .attr("class", "attack-counter")
      .attr("transform", `translate(${width - 250}, 30)`);

    // Add counter background
    const counterBg = counterGroup
      .append("rect")
      .attr("x", -20)
      .attr("y", -15)
      .attr("width", 240)
      .attr("height", 60)
      .style("fill", "rgba(0, 0, 0, 0.9)")
      .style("stroke", "#ff0000")
      .style("stroke-width", 2)
      .style("rx", 8)
      .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.6))")
      .style("opacity", 0);

    // Add main counter text
    const counterText = counterGroup
      .append("text")
      .attr("x", 0)
      .attr("y", 0)
      .style("fill", "#ff0000")
      .style("font-size", "24px")
      .style("font-weight", "bold")
      .style("text-anchor", "start")
      .style("opacity", 0)
      .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.8)")
      .text(`${totalAttacks.toLocaleString()} ATTACKS`);

    // Add subtitle
    const subtitle = counterGroup
      .append("text")
      .attr("x", 0)
      .attr("y", 20)
      .style("fill", "#ffffff")
      .style("font-size", "12px")
      .style("text-anchor", "start")
      .style("opacity", 0)
      .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)")
      .text("ON THIS DAY");

    // Animate counter entrance
    gsap.timeline({ delay: 2 })
      .to(counterBg.node(), {
        opacity: 1,
        duration: 0.5,
        ease: "power2.out"
      })
      .to(counterText.node(), {
        opacity: 1,
        duration: 0.3,
        ease: "power1.out"
      }, "-=0.2")
      .to(subtitle.node(), {
        opacity: 1,
        duration: 0.3,
        ease: "power1.out"
      }, "-=0.1");

    // Add pulsing effect to counter
    gsap.to(counterText.node(), {
      scale: 1.05,
      duration: 2,
      ease: "power2.inOut",
      repeat: -1,
      yoyo: true
    });

    // Add blinking effect to background
    gsap.to(counterBg.node(), {
      stroke: "#ff4444",
      duration: 1,
      ease: "power2.inOut",
      repeat: -1,
      yoyo: true
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

export default WorldMap;
