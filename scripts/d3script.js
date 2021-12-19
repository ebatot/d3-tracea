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
	AND = "AND",
	OFF = "OFF"

thresholds = [] ;
thresholdsCheckboxesValues = []
var thresholdsMergeOperator;
d3.json("data/thresholds.json", function(data) {
	Object.keys(data.values).forEach(function (k) {
		thresholdsMergeOperator = data.mergeOperator
		thresholds[k] = data.values[k]
		thresholdsCheckboxesValues[k] = "on"
	})
});
var sliderBox = d3.select('body').append('div').attr("id", "sliderBox").append('center')

var nodeSelection = []

var svg =    d3.select("svg"),
    width =  +svg.attr("width"),
    height = +svg.attr("height"),
	link,
	links,
	node,
	edgelabels,
	edgepaths,
	edgesize,
	legendNamesNodes, nGroups,
	legendNamesLinks, lGroups,
	linkedByIndex;
var container = svg.append('g');

var gLines = container.append('g').attr("id", "lines");
var gNodes = container.append('g').attr("id", "nodes");

svg.on('click', function(d, i) {
	stopMoving();
});

var colorNodes = d3.scaleOrdinal(d3.schemeCategory20);
var colorLinks = d3.scaleOrdinal(d3.schemeCategory20.slice(6));

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

function neighboring(a, b) {
	return linkedByIndex[a.index + ',' + b.index];
}

d3.json(dataPath, function(error, graph) {
	if (error) {
		showError(datapath);
		throw error;
	}

	links = graph.links;
	nodes = graph.nodes;
	
	edgesize = getEdgeSizeLinearScale(nodes, CIRCLE_SIZE[0], CIRCLE_SIZE[1]);
	linkedByIndex = getLinkageByIndex(links);
	// A function to test if two nodes are neighboring.

	/** Counting groups, for color rendering **/
	legendNamesNodes = buildLegendNames(nodes);
	legendNamesLinks = buildLegendNames(links);
	nGroups = legendNamesNodes.length;
	lGroups = legendNamesLinks.length;
	
	/** Connect Source/Targets of connections with their IDs */
	/**  modify the graph.links with source_id and target_id */
	links.forEach(function(e) { 
		// Get the source and target nodes (connects IDs)
		var sourceNode = nodes.filter(function(n) { return n.id === e.source_id; })[0],
			targetNode = nodes.filter(function(n) { return n.id === e.target_id; })[0];
		e.source = sourceNode;
		e.target = targetNode;
	});

	edgepaths = gLines.selectAll(".edgepath")
		.data(links)
		.enter()
		.append('path')
		.attrs({
			'class': 'edgepath',
			'stroke': d => colorLinks(d.group), 
			'stroke-width': function(d) { return edgesize(d.confidence); },
			'id': function (d) {return 'ep' + d.id},
			'pointer-events': 'none'
		})		

	edgelabels = gLines.selectAll(".edgelabel")
		.data(links)
		.enter()
		.append('text')
		.style("pointer-events", "none")
		.attrs({
			'class': 'edgelabel',
			'id': function (d) {return 'el' + d.id;},
			'font-size': 12
		});

	edgelabels.append('textPath')
		.attr('xlink:href', function (d) {return '#ep' + d.id;})
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
			.on("start", dragstartedOnNode)
			.on("drag", draggedOnNode)
			.on("end", dragendedOnNode)
		);
	
	node.append("circle")
		.attrs({
			'id':  d => 'n'+ d.id,
			'class': 'node',
			'cx': d => d.x,
			'cy': d => d.y,
			// Use degree centrality from R igraph in json.
			'r': function(d, i) { return edgesize(d.size); },
			// Color by group, a result of modularity calculation in R igraph.
			"fill": function(d) { return colorNodes(d.group); },
			'stroke-width': '1.0'
		})
		.on('click', function(d, i) {
			if (d3.event.ctrlKey) {
				// Ctrl down and not shift on a selected shape
				if(nodeSelection.includes(d)) {
					addNodeToSelection(d);
				} else { //shift, or not selected
					removeNodeFromSelection(d);	
				}
			}
			/*if(d3.event.shiftKey) {
				selectNode(d)
			}*/
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
		
/***  SLIDERS and LEGEND  ***/
	Object.keys(thresholds).forEach(function (e) {
		addSlider(e, nodes, links, nGroups);
	})

	var legend = d3.select("#legend").append("svg")
	legend
		.attrs({
			"width":    180,
			"height":   (nGroups+lGroups) * 20,
			"position": "absolute",
			"top":      "10px",
			"right":    "10px"
		})
	
	
	
	
	var legendNodes = addlegendNodes(legend, legendNamesNodes);
	var legendLinks = addlegendLinks(legend, legendNamesLinks);


		



/***  Simulation update  ***/
	simulation
		.nodes(nodes)
		.on("tick", ticked);
			
	simulation
		.force("link")
		.links(links);
	// Collision detection based on degree centrality.
	simulation
	 	.force("collide", d3.forceCollide().radius( function (d) { return edgesize(d.size); }));
});

function selectNode(d) {
	nodeSelection = []
	nodeSelection.push(d)
}

function removeNodeFromSelection(d) {
	nodeSelection.push(d);
	d3.select('#n' + d.id).attr('stroke-width', "3.0");
}

function addNodeToSelection(d) {
	const index = nodeSelection.indexOf(d);
	if (index > -1) {
		nodeSelection.splice(index, 1);
	}
	d3.select('#n' + d.id).attr('stroke-width', "1.0");
}

// A slider that removes nodes below/above the input threshold.
function addSlider(attribute, nodes, links, nGroups) {

	var initValue = thresholds[attribute][2]

	// A slider that removes nodes below the input threshold.
	var slider = sliderBox
		.append('div')
		.style('font-size', '60%');

	var p = slider.append("p")

	p.append("label")
		.text("   "+thresholds[attribute][1]+' '+attribute+' for connection: ')

	p.append('label')
		.attr('id', "label"+attribute)
		.attr('for', 'threshold')
		.text(initValue).style('font-weight', 'bold')
		.style('font-size', '120%');

	p.append('input')
		.attr('type', 'range')
		.attr('min', d3.min(links, function(d) {return d[attribute]; }))
		.attr('max', d3.max(links, function(d) {return d[attribute]; }))
		.attr('value', initValue)
		.attr('id', 'threshold'+attribute)
		.style('width', '50%')
		.style('display', 'block')
		.on('input', function () { 
			updateThresholdValue(this.value, attribute, links, nGroups, nodes);
		});

	p.insert('input', ":first-child")
		.attrs({
			'type': 'checkbox',
			'id': 'cb'+attribute,
			'value': 'on',
		})
		.property("checked", true)
		.on('change', function () { 
			updateThresholdCheckboxes(this.checked, attribute);
		})
}

function updateThresholdCheckboxes(checked, attribute) {
	d3.select('#cb'+attribute).attr("value", checked? "on":"off")
	thresholdsCheckboxesValues[attribute] = checked
	if(checked) {
		d3.select("#threshold"+attribute).attr("disabled", null)
	} else {
		d3.select("#threshold"+attribute).attr("disabled", "disabled")
	}
}

function updateThresholdValue(value, attribute, links, nGroups, nodes) {
	var threshold = value;
	// Update label text
	d3.select('#label' + attribute).text(threshold);

	// Find the links that are at or above the thresholds.
	var newData = [];
	links.forEach(function (d) {
		container.select("#ep" + d.id).remove();
		// Affect new threshold value for slider attribute
		thresholds[attribute][2] = threshold;
		// testThresholds values -> consider link d
		if (testThresholds(d))
			newData.push(d);
	});

	// Data join with only those new links.
	edgepaths = edgepaths.data(newData,
		function (d) { return d.source + ', ' + d.target; });
	edgepaths.exit().remove();

	var linkEnter = edgepaths.enter()
		.insert('path', ":first-child")
		.attrs({
			'class': 'edgepath',
			'stroke': d => colorLinks(d.group + nGroups),
			'stroke-width': function (d) { return edgesize(d[attribute]); },
			'id': function (d) { return 'ep' + d.id; },
			'pointer-events': 'none'
		});

	edgepaths = edgepaths.merge(linkEnter);

	node = node.data(nodes);
	// Restart simulation with new link data.
	simulation
		.nodes(nodes).on('tick', ticked)
		.force("link").links(newData);
	/* Edgelabels remains in DOM but are not anchored, they are invisible*/
	simulation.alphaTarget(0.1).restart();
}

function testThresholds(link) {
	var toInclude = (thresholdsMergeOperator == AND) ? true : false;
	//Object.keys(obj).forEach(key => console.log(key, obj[key]))
	Object.keys(thresholds).forEach(function (k) {
		t = thresholds[k];
		if(thresholdsCheckboxesValues[k] ) {// Ticked box
			toInclTmp =	testThresholdIn(t, k, link);	
			switch (thresholdsMergeOperator) {
				case AND:
					toInclude &= toInclTmp;
					break;
				case OR:
					toInclude |= toInclTmp; // OR SHOULD BE TESTED BETTER @TODO
					break;
				default:
					console.log("thresholdMergeOperator '"+thresholdsMergeOperator+"' invalid.")
					break;
			}
		}
	});
	return toInclude;

	function testThresholdIn(t, k, link) {
		return (t[1] == MIN && t[2] <= link[k]) ||
			   (t[1] == MAX && t[2] >= link[k]);
	}
}

function addlegendNodes(legend, legendNamesNodes){
	// add a legend
	var legendNodes = legend
		.append("svg")
		.attr("class", "legend")
		.attr("id", "#legendNodes")
		.attr("width", 180)
		.attr("height", (legendNamesNodes.length * 20))
		.selectAll("g")
		.data(colorNodes.domain())
		.enter()
		.append("g")
		.attr("transform", function(d, i) {
				return "translate(0," + (i * 20) + ")";
			});

	legendNodes.append("rect")
		.attr("width", 18)
		.attr("height", 18)
		.style("fill", colorNodes);

	// append text to legends
	legendNodes.append("text")
		.data(colorNodes.domain())
		.attr("x", 24)
		.attr("y", 9)
		.attr("dy", ".35em")
		.text(function(d) { return legendNamesNodes.find(x => x.id === d).type; })
		.style('font-size', 10);

		return legendNodes;
}

function addlegendLinks(legend, legendNamesLinks){
	// add a legend
	var legendLinks = legend
		.append("svg")
		.attr("class", "legend")
		.attr("id", "#legendLinks")
		.attr("width", 180)
		.attr("height", legendNamesLinks.length * 20 )
		//Offset to show link legend below node legend
		.attr("transform", "translate(0," +((nGroups + 1) * 20) + ")")
		.selectAll("g")
		.data(colorLinks.domain())
		.enter()
		.append("g")
		.attr("transform", function(d, i) {
				return "translate(0," + (i * 20) + ")";
			});

	legendLinks.append("rect")
		.attr("width", 18)
		.attr("height", 18)
		.style("fill", colorLinks);

	// append text to legends
	legendLinks.append("text")
		.data(colorLinks.domain())
		.attr("x", 24)
		.attr("y", 9)
		.attr("dy", ".35em")
		.text(function(d) { return legendNamesLinks.find(x => x.id === (d)).type; })
		.style('font-size', 10);

		return legendLinks;
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

function dragstartedOnNode(d) {
	if (!event.shiftKey && nodeSelection.includes(d)) {
		if (!d3.event.active) simulation.alphaTarget(0.1).restart();
		nodeSelection.forEach(function (d) {
			d.fx = d.x;
			d.fy = d.y;
		})
	} else {
		sourceX = d.fx
		sourceY = d.fy
		if (!d3.event.active) simulation.alphaTarget(0.1).restart();
		d.fx = d.x;
		d.fy = d.y;
	}
}

function draggedOnNode(d) {
	// Click in a selected shape or SHIFT key id down
	if (!event.shiftKey && nodeSelection.includes(d)) {
		// Move all selected shape
		if (!d3.event.active) simulation.alphaTarget(0.1).restart();
		sourceX = d.fx
		sourceY = d.fy
		d.fx = d3.event.x;
		d.fy = d3.event.y;
		diffX = sourceX - d.fx
		diffY = sourceY - d.fy
		//log.text(nodeSelection)
		nodeSelection.forEach(function (dd) {
			if(dd != d) {
				dd.x = dd.x - diffX
				dd.y = dd.y - diffY
				dd.fx = dd.fx - diffX
				dd.fy = dd.fy - diffY
			}
		})
// Click in unselected shape, or SHIFT is down 
} else {
		// Move the shape under pointer only
		d.fx = d3.event.x;
		d.fy = d3.event.y;
	}
}

function dragendedOnNode(d) {
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

// Linear scale for degree centrality. WITH SIZE
function  getEdgeSizeLinearScale(nodes, min, max) {
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
function buildLegendNames(nodes){
	// load legend names from type column
	var legendNames = [];
	var map = new Map();
	for (var item of nodes) {
		if(!map.has(item.group)){
			map.set(item.group, true);    // set any value to Map
			legendNames.push({
				id: item.group,
				type: item.type 
			});
		}
	}
	legendNames.sort( function( a, b ) { return a.id - b.id });
	return legendNames;
}

function stopMoving() {
	force.stop();
}
