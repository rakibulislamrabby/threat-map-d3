'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import colorData from '../data/randomcountries.json';
import worldData from '../data/world.json';

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

const WorldMap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  const width = 1100;
  const height = 750;

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !svgRef.current || !tooltipRef.current) return;

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
  }, [isClient]);

  if (!isClient) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#333', fontSize: '16px' }}>
          Loading world map...
        </div>
      </div>
    );
  }

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