/*****************************************************************************
* Copyright (c) 2015, 2021 CEA LIST, Edouard Batot
*
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the Eclipse Public License 2.0
* which accompanies this distribution, and is available at
* https://www.eclipse.org/legal/epl-2.0/
*
* SPDX-License-Identifier: EPL-2.0
*
* Contributors:
* CEA LIST - Initial API and implementation
* Edouard Batot (UOC SOM) ebatot@uoc.edu 
*****************************************************************************/

var log = d3.select("body").select("center").append("label").style('color', '#900').attr("id", "logger")
.text("Logger");

var CIRCLE_SIZE = [20, 10];
var LEGEND_GAP = 120; //legend start from top
var moving = true;

var MIN = "MIN",
 	MAX = "MAX",
	OR  = "OR",
	AND = "AND"

thresholds = [] ;
thresholdsMergeOperator = MIN;
d3.json("data/thresholds.json", function(data) {
	Object.keys(data.values).forEach(function (k) {
		thresholdsMergeOperator = data.mergeOperator
		thresholds[k] = data.values[k]
	})
});

var svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height"),
	link,
	links,
	node,
	edgelabels,
	edgepaths,
	degreeSize,
	nGroups,
	lGroups;
var container = svg.append('g');

var gLines = container.append('g').attr("id", "lines");
var gNodes = container.append('g').attr("id", "nodes");

svg.on('click', function(d, i) {
	stopMoving();
});

var color = d3.scaleOrdinal(d3.schemeCategory20);

// Call zoom for svg container.
svg.call(d3.zoom().on('zoom', zoomed));



var simulation = this.force = d3.forceSimulation()
	.force("link", d3.forceLink().distance(100).strength(1)) // {}
	.force("charge", d3.forceManyBody().strength([-500]).distanceMax([200])) //120 500
	.force("center", d3.forceCenter(width / 2, height / 2))
	.force('collision', d3.forceCollide().radius(function(d) {return d.radius*1000}));

d3.forceLink().distance(function(d) {return d.distance;}).strength(0.11)


var dataPath = "data/eDrone_example_out.json"
if ( getUrlVars()['imf'] != null )
	dataPath = getUrlVars()['imf'];

d3.json(dataPath, function(error, graph) {
	if (error) {
		showError(datapath);
		throw error;
	}

	links = graph.links;
	nodes = graph.nodes;

	
	degreeSize = getLinearScale(nodes, CIRCLE_SIZE[0], CIRCLE_SIZE[1]);
	var linkedByIndex = getLinkageByIndex(links);
	// A function to test if two nodes are neighboring.
	function neighboring(a, b) {
		return linkedByIndex[a.index + ',' + b.index];
	}


	/** Counting groups, for color rendering **/
		var tmp = buildLegend(nodes, links);
		var legendNames = tmp[0];
		nGroups = tmp[1];
		lGroups = tmp[2];
	/** END ocunting groups **/


	edges = [];
	links.forEach(function(e) { 
		// Get the source and target nodes (connects IDs)
		var sourceNode = nodes.filter(function(n) { return n.id === e.source_id; })[0],
			targetNode = nodes.filter(function(n) { return n.id === e.target_id; })[0];

		e.source = sourceNode;
		e.target = targetNode;
		// Add the edge to the array
		edges.push({source: sourceNode, target: targetNode});
	});
		

	edgepaths = gLines.selectAll(".edgepath")
		.data(links)
		.enter()
		.append('path')
		.attrs({
			'class': 'edgepath',
			'stroke': d => color(d.group+nGroups),
			'stroke-width': function(d) { return degreeSize(d.confidence); },
			'id': function (d) {return 'l' + d.id},
			'pointer-events': 'none'
		})



	edgelabels = gLines.selectAll(".edgelabel")
		.data(links)
		.enter()
		.append('text')
		.style("pointer-events", "none")
		.attrs({
			'class': 'edgelabel',
			'id': function (d, i) {return 'edgelabel' + i;},
			'font-size': 12,
			'fill': '#000'
		});

	edgelabels.append('textPath')
		.attr('xlink:href', function (d, i) {return '#l' + d.id;})
		.attr("startOffset", "50%")
		.style("text-anchor", "middle")
		.style("pointer-events", "none")
		.text(function (d) {return d.name + '\n' +d.confidence;});

	node = gNodes.selectAll(".node")
		.data(nodes)
		.enter()
		.append("g")
		.attr("class", "node")
		.call(d3.drag()
			.on("start", dragstarted)
			.on("drag", dragged)
			.on("end", dragended)
		);
	
	
	node.append("circle")
		.attrs({
			'class': 'node',
			'cx': d => d.x,
			'cy': d => d.y,
			// Use degree centrality from R igraph in json.
			'r': function(d, i) { return degreeSize(d.size); },
			// Color by group, a result of modularity calculation in R igraph.
			"fill": function(d) { return color(d.group); },
			'stroke-width': '1.0'
		})
		.on('click', function(d, i) {
			d3.event.stopPropagation();
		})
		
			
	node.append("text")
		.text(function (d) { return d.name; })
		.style("text-anchor", "top middle")
		.style("y", '20px')
		.style("fill", "#555")
		.style("font-family", "Arial")
		.style("font-size", 12)
		.attr('pointer-events', 'none');
	
	node.append("title")
		.text(d => d.name);
	
		
/****************************************
                    SLIDER
****************************************/


	//addSlider(thresholds["confidence"][0], nodes, links, nGroups)
	//addSlider(thresholds["energy"][0], nodes, links, nGroups)
	Object.keys(thresholds).forEach(function (e) {
		addSlider(e, nodes, links, nGroups);
	})

	var legend = addlegend(legendNames);
   
		
	//	<button type="stopButton"  onclick="stopMoving()">Stop moving !</button>

	simulation
		.nodes(nodes)
		.on("tick", ticked);

			
	simulation
		.force("link")
		.links(links);
	// Collision detection based on degree centrality.
	simulation
	 	.force("collide", d3.forceCollide().radius( function (d) { return degreeSize(d.size); }));
});

function addSlider(attribute, nodes, links, nGroups) {

	var initValue = thresholds[attribute][2]

	// A slider that removes nodes below the input threshold.
	var slider = d3.select('body').append('p').append('center')
	.text(thresholds[attribute][1]+' '+attribute+' for connection: ')
	.style('font-size', '60%');

	slider.attr('value', initValue)

	slider.append('label')
	.attr('id', "label"+attribute)
	.attr('for', 'threshold')
	.text(initValue).style('font-weight', 'bold')
	.style('font-size', '120%');

	slider.append('input')
		.attr('type', 'range')
		.attr('min', d3.min(links, function(d) {return d[attribute]; }))
		.attr('max', d3.max(links, function(d) {return d[attribute]; }))
		.attr('value', initValue)
		.attr('id', 'threshold'+attribute)
		.style('width', '50%')
		.style('display', 'block')
		.on('input', function () { 
			var threshold = this.value;

			d3.select('#label'+attribute).text(threshold);

			// Find the links that are at or above the thresholds.
			var newData = [];
			links.forEach( function (d) {
				container.select("#l"+d.id).remove()
				// Affect new threshold value for slider attribute
				thresholds[attribute][2] = threshold
				// testThresholds values -> consider link d
				if(testThresholds(d))
					newData.push(d)
			});

			// Data join with only those new links.
			edgepaths = edgepaths.data(newData, 
				function(d) { return d.source + ', ' + d.target;});
			edgepaths.exit().remove();

			var linkEnter = edgepaths.enter()
				.insert('path',":first-child")
				.attrs({
					'class': 'edgepath',
					'stroke': d => color(d.group+nGroups),
					'stroke-width': function(d) { return degreeSize(d[attribute]); },
					'id': function (d) {return 'edgepath' + d.id},
					'pointer-events': 'none'
				})
			
			edgepaths = edgepaths.merge(linkEnter);
			node = node.data(nodes);
			// Restart simulation with new link data.
			simulation
				.nodes(nodes).on('tick', ticked)
				.force("link").links(newData);

			simulation.alphaTarget(0.1).restart();
	});
}


function testThresholds(link) {
	if(thresholdsMergeOperator == OR) {
		toInclude = false;
		//Object.keys(obj).forEach(key => console.log(key, obj[key]))
		Object.keys(thresholds).forEach(function (k) {
			t = thresholds[k];
			toInclTmp =
				(t[1] == MIN && t[2] <= link[k]) ||
				(t[1] == MAX && t[2] >= link[k]);
			toInclude |= toInclTmp;
	});
	} else if(thresholdsMergeOperator == AND) {
		toInclude = true;
		//Object.keys(obj).forEach(key => console.log(key, obj[key]))
		Object.keys(thresholds).forEach(function (k) {
			t = thresholds[k];
			toInclTmp =
				(t[1] == MIN && t[2] <= link[k]) ||
				(t[1] == MAX && t[2] >= link[k]);
			toInclude &= toInclTmp;
		});
	}


	
	return toInclude;
}

function addlegend(legendNames){
	// add a legend
	var legend = d3.select("#legend")
		.append("svg")
		.attr("class", "legend")
		.attr("width", 180)
		.attr("height", (LEGEND_GAP + (legendNames.length * 20)))
		.selectAll("g")
		.data(color.domain())
		.enter()
		.append("g")
		.attr("transform", function(d, i) {
		return "translate(0," + (LEGEND_GAP + i * 20) + ")";
		});

	legend.append("rect")
		.attr("width", 18)
		.attr("height", 18)
		.style("fill", color);

	// append text to legends
	legend.append("text")
		.data(color.domain())
		.attr("x", 24)
		.attr("y", 9)
		.attr("dy", ".35em")
		.text(function(d) {	return legendNames.find(x => x.id === d).type; })
		.style('font-size', 10);
		
	legend.append("text")
		.append("button")
		.attr("type", "stopButton")
		.on("click", stopMoving)
		.text("Stop moving !");

		return legend;
}

function ticked() {
	edgepaths
		.attr("x1", function(d) { return d.source.x; })
		.attr("y1", function(d) { return d.source.y; })
		.attr("x2", function(d) { return d.target.x; })
		.attr("y2", function(d) { return d.target.y; });

	node
		.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
	// node.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
		
		
	edgepaths.attr('d', function (d) {
			return 'M ' + d.source.x + ' ' + d.source.y + ' L ' + d.target.x + ' ' + d.target.y;
		});

	edgelabels.attr('transform', function (d) {
		if (d.target.x < d.source.x) {
			var bbox = this.getBBox();
			rx = bbox.x + bbox.width / 2;
			ry = bbox.y + bbox.height / 2;
			return 'rotate(180 ' + rx + ' ' + ry + ')';
		}
		else {
			return 'rotate(0)';
		}
	});	
}


function dragstarted(d) {
	if (!d3.event.active) simulation.alphaTarget(0.1).restart();
	d.fx = d.x;
	d.fy = d.y; 
}

function dragged(d) {
	d.fx = d3.event.x;
	d.fy = d3.event.y;
}

function dragended(d) {
	if (!d3.event.active && !stopMoving) simulation.alphaTarget(0);
	//d.fx = null;
	//d.fy = null;
}

function showError(datapath) {
	d3.select("body").select("center").append("h2").style('color', '#900')
	.text("Error loading the file '" + dataPath + "'");
	d3.select("body").select("center").append("p").style('color', '#600')
		.text("Check HTTP option 'imf' and..");
	d3.select("body").select("center").append("h3").style('color', '#900')
		.text("Try again !");
	d3.select("svg").remove();
	d3.select("button").remove();
}

// Linear scale for degree centrality.
function  getLinearScale(nodes, min, max) {
	return d3.scaleLinear()
		.domain([d3.min(nodes, function(d) {return d.size; }),d3.max(nodes, function(d) {return d.size; })])
		.range([min,max]);
}

/** Neighboor matrix in str **/
// Make object of all neighboring nodes.
function getLinkageByIndex(links) {
	linkedByIndex = {};
	links.forEach(function(d) {
		linkedByIndex[d.source + ',' + d.target] = 1;
		linkedByIndex[d.target + ',' + d.source] = 1;
	});
	return linkedByIndex;
}

// Zooming function translates the size of the svg container.
function zoomed() {
	container.attr("transform", "translate(" + d3.event.transform.x + ", " + d3.event.transform.y + ") scale(" + d3.event.transform.k + ")");
}

// Search for nodes by making all unmatched nodes temporarily transparent.
function searchNodes() {
  var term = document.getElementById('searchTerm').value;
  var selected = container.selectAll('.node').filter(function (d, i) {
	  return d.name.toLowerCase().search(term.toLowerCase()) == -1;
  });
  selected.style('opacity', '0');
  var edgepaths = container.selectAll('.link');
  edgepaths.style('stroke-opacity', '0');
  d3.selectAll('.node').transition()
	  .duration(5000)
	  .style('opacity', '1');
  d3.selectAll('.link').transition().duration(5000).style('stroke-opacity', '0.6');
}

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return vars;
}

function buildLegend(nodes, links){
	// load legend names from type column
	var legendNames = [];
	var map = new Map();
	var i = 0; // Fill up th i to continue counting when legending the links.
	for (var item of nodes) {
		if(!map.has(item.group)){
			map.set(item.group, true);    // set any value to Map
			legendNames.push({
				id: item.group,
				type: item.type //item.type vs label_data //TODO
			});
			i = i+1;
		}
	}
	var nGroups = legendNames.length; //Number of groups of nodes

	var map = new Map();
	for (var item of links) {
		if(!map.has(item.group + i)){
			map.set(item.group + i, true);    // set any value to Map
			legendNames.push({
				id: item.group + i,
				type: item.type 
			});
		}
	}
	var lGroups = nGroups - legendNames.length; // Number of groups of links
	return [legendNames,nGroups,lGroups];
}

function stopMoving() {
	force.stop();
}