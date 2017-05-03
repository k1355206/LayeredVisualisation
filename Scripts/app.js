(function () {
    "use strict";

    class IllegalSateError extends Error {
        constructor(message) {
            super(message);
            this.message = message;
            this.name = 'IllegalSateError';
        }
    }

    const innerWidthScale = 0.97;
    const innerHeightScale = 0.95;

    const componentStructure = Object.freeze({
        searchBar: Object.freeze({
            height: 40
        }),
        graph: Object.freeze({
            width: window.innerWidth * innerWidthScale,
            height: 0.7 * (window.innerHeight * innerHeightScale),
        }),
        timeSlicer: Object.freeze({
            width: window.innerWidth * innerWidthScale,
            height: 0.3 * (window.innerHeight * innerHeightScale - 40)
        })
    });

    const selectionRelation = Object.freeze({
        none: 0,
        self: 1,
        neighbour: 2,
        child: 3,
        neighbourChild: 4
    });

    const openNodeProperty = Object.freeze({
        margin: 1,
        linkOffsetY: 20
    });

    let currentMaximized = null;

    class Node {
        constructor(name, layer, parent) {
            this.name = name;
            this.layer = layer;
            this.parent = parent;
            this.isActive = false;
            this.selectionRelation = selectionRelation.none;
            this.scaleFactor = 1;
            this.offsetX = 0;
            this.offsetY = 0;
            this.openNodes = [];
            this.openNodeIndex = -1;
            this.isMaximized = false;
            this.selectedNodeNeighbourCount = 0;
        }

        isOpen() {
            return this.openNodeIndex >= 0;
        }

        toggleMaximization() {
            if (this.isOpen()) {
                let factor = 1;

                if (this.isMaximized) {
                    currentMaximized = null;
                    this.isMaximized = false;
                }
                else {
                    if (currentMaximized) {
                        currentMaximized.toggleMaximization();
                    }
                    currentMaximized = this;
                    this.isMaximized = true;
                    factor = Math.pow(2, this.layer);
                }

                this.scale(factor);

                graphParts.forEach((value, key) => {
                    if (value.layer <= this.layer) {
                        value.nodes.forEach(node => {
                            if (node.name !== this.name) {
                                node.isActive = !this.isMaximized;
                            }
                            if (node.isOpen()) {
                                node.adjustOffset(factor === 1);
                            }
                        });
                    } else {
                        let parent = value.parent;
                        while (parent.layer !== this.layer) {
                            parent = parent.parent;
                        }

                        if (parent.name !== this.name) {
                            value.nodes.forEach(node => {
                                node.isActive = !this.isMaximized;
                            });
                        }
                    }
                });
            }
            else {
                throw new IllegalSateError("Toggle maximization only possible if node is open!");
            }
        }

        adjustOffset(positive) {
            if (positive) {
                this.offsetX += componentStructure.graph.width / Math.pow(2, this.layer);
                this.offsetY += this.openNodeIndex * componentStructure.graph.height / Math.pow(2, this.layer);
            }
            else {
                this.offsetX -= componentStructure.graph.width / Math.pow(2, this.layer);
                this.offsetY -= this.openNodeIndex * componentStructure.graph.height / Math.pow(2, this.layer);
            }
        }

        scale(factor) {
            this.scaleFactor = factor;
            if (this.isOpen()) {
                graphParts.get(this.name).nodes.forEach(node => {
                    node.scale(factor);
                });
            }
        }

        getXValue() {
            let value = this.scaleFactor * (this.x + this.offsetX);
            let parent = this.parent;
            while (parent) {
                value += parent.scaleFactor * (parent.x + parent.offsetX);
                parent = parent.parent;
            }
            return value;
        }

        getYValue() {
            let value = this.scaleFactor * (this.y + this.offsetY);
            let parent = this.parent;
            while (parent) {
                value += parent.scaleFactor * (parent.y + parent.offsetY);
                parent = parent.parent;
            }
            return value;
        }

        setSelectionRelationNeighbour() {
            selectedNodeNeighbours.push(this);
            this.selectionRelation = selectionRelation.neighbour;
        }

        setSelectionRelationNeighbourChild(count) {
            selectedNodeNeighbours.push(this);
            this.selectionRelation = selectionRelation.neighbourChild;
        }

        updateSelectedNodeNeighbourCount() {
            let neighbourNames = [];
            currentBareNodeLinks.forEach(link => {
                let layeredSourceId = graphData.nodeMapping.get(link.source)["layer" + this.layer];
                let layeredTargetId = graphData.nodeMapping.get(link.target)["layer" + this.layer];
                let layeredSelectionSourceId = graphData.nodeMapping.get(link.source)["layer" + selectedNode.layer];
                let layeredSelectionTargetId = graphData.nodeMapping.get(link.target)["layer" + selectedNode.layer];

                if (layeredSelectionSourceId === selectedNode.name) {
                    if (layeredTargetId === this.name && !neighbourNames.includes(layeredSelectionTargetId)) {
                        neighbourNames.push(layeredSelectionTargetId);
                    }
                } else if (layeredSelectionTargetId === selectedNode.name) {
                    if (layeredSourceId === this.name && !neighbourNames.includes(layeredSelectionSourceId)) {
                        neighbourNames.push(layeredSelectionSourceId);
                    }
                }
            });
            this.selectedNodeNeighbourCount = neighbourNames.length;
        }
    }

    class Link {
        constructor(source, target, date) {
            this.source = source;
            this.target = target;
            this.date = date;
            this.isActive = false;
        }

        isTopLayerLink() {
            return this.source.parent === undefined && this.target.parent === undefined;
        }

        isCrossConnection() {
            return this.source.parent !== this.target.parent;
        }

        isOpen() {
            return this.source.isOpen() && this.target.isOpen();
        }

        static weightLink(link, targetArray) {
            let linkMatches = targetArray.filter(weightedLink =>
                (weightedLink.source === link.source && weightedLink.target === link.target) ||
                (weightedLink.source === link.target && weightedLink.target === link.source));

            if (linkMatches.length > 0) {
                linkMatches[0].weight++;
            }
            else {
                link.weight = 1;
                targetArray.push(link);
            }
        }

        updateNeighbours() {
            if (selectionActivated) {
                if (this.source.selectionRelation === selectionRelation.self) {
                    this.target.setSelectionRelationNeighbour();
                }
                else if (this.target.selectionRelation === selectionRelation.self) {
                    this.source.setSelectionRelationNeighbour();
                }
                else if (this.source.selectionRelation === selectionRelation.child) {
                    this.target.updateSelectedNodeNeighbourCount();
                    if (this.target.selectedNodeNeighbourCount > 0) {
                        this.target.setSelectionRelationNeighbourChild();
                    }
                }
                else if (this.target.selectionRelation === selectionRelation.child) {
                    this.source.updateSelectedNodeNeighbourCount();
                    if (this.source.selectedNodeNeighbourCount > 0) {
                        this.source.setSelectionRelationNeighbourChild();
                    }
                }
            }
        }
    }

    const defaultProperty = Object.freeze({
        visibility: Object.freeze({
            visible: "visible",
            hidden: "hidden"
        })
    });

    const linkProperty = Object.freeze({
        opacity: Object.freeze({
            default: 0.3,
            primary: 1,
            transparent: 0
        }),
        strokeWidth: Object.freeze({
            default: 1,
            primary: 1.5
        }),
        stroke: Object.freeze({
            default: "#0C0C0C",
            primary: "#F6CD00"
        }),
        transitionDuration: Object.freeze({
            update: 500,
            exit: 500
        })
    });

    class LinkDrawingComponent {
        static getLinkClasses(link) {
            let value = "link layer" + link.source.layer;
            if (!link.isTopLayerLink()) {
                value += " parent-node-" + link.source.parent.name;
                if (link.isCrossConnection()) {
                    value += " parent-node-" + link.target.parent.name;
                    value += " cross-connection";
                }
            }
            return value;
        }

        static getLineVisibility(link) {
            if (link.isOpen()) {
                return defaultProperty.visibility.hidden;
            }
            else if (link.isActive) {
                if (link.isCrossConnection) {
                    if (link.source.isActive && link.target.isActive) {
                        return defaultProperty.visibility.visible;
                    }
                    else {
                        return defaultProperty.visibility.hidden;
                    }
                }
                else {
                    return defaultProperty.visibility.visible;
                }
            }
            else {
                return defaultProperty.visibility.hidden;
            }
        }

        static isNeighbourHighlightingConnection(link) {
            return selectionActivated &&
                link.source.selectionRelation === selectionRelation.self || link.target.selectionRelation === selectionRelation.self ||
                link.source.selectionRelation === selectionRelation.child && link.target.selectedNodeNeighbourCount > 0 ||
                link.target.selectionRelation === selectionRelation.child && link.source.selectedNodeNeighbourCount > 0;
        }

        static getLineOpacity(link) {
            if (LinkDrawingComponent.isNeighbourHighlightingConnection(link)) {
                return linkProperty.opacity.primary;
            }
            else {
                return linkProperty.opacity.default;
            }
        }

        static getLineStrokeWidth(link) {
            if (LinkDrawingComponent.isNeighbourHighlightingConnection(link)) {
                return linkProperty.strokeWidth.primary;
            }
            else {
                return linkProperty.strokeWidth.default;
            }
        }

        static getLineStroke(link) {
            if (LinkDrawingComponent.isNeighbourHighlightingConnection(link)) {
                return linkProperty.stroke.primary;
            } else {
                return linkProperty.stroke.default;
            }
        }

        static getLineX1(link) {
            return link.source.getXValue();
        }

        static getLineX2(link) {
            return link.target.getXValue();
        }

        static getLineY1(link) {
            let value = link.source.getYValue();
            if (link.source.isOpen()) {
                value += openNodeProperty.linkOffsetY;
            }
            return value;
        }

        static getLineY2(link) {
            let value = link.target.getYValue();
            if (link.target.isOpen()) {
                value += openNodeProperty.linkOffsetY;
            }
            return value;
        }

        static update(selection) {
            selection.each(link => link.updateNeighbours());

            selection
                .attr("x1", LinkDrawingComponent.getLineX1)
                .attr("y1", LinkDrawingComponent.getLineY1)
                .attr("x2", LinkDrawingComponent.getLineX2)
                .attr("y2", LinkDrawingComponent.getLineY2)
                .style("visibility", LinkDrawingComponent.getLineVisibility)
                .style("stroke", LinkDrawingComponent.getLineStroke)
                .transition()
                .duration(linkProperty.transitionDuration.update)
                .style("opacity", LinkDrawingComponent.getLineOpacity)
                .style("stroke-width", LinkDrawingComponent.getLineStrokeWidth);
        }

        static enter(selection) {
            selection.enter().insert("line", ".link-insert-position")
                .attr("class", LinkDrawingComponent.getLinkClasses)
                .style("opacity", linkProperty.opacity.default);
        }

        static exit(selection) {
            selection
                .exit()
                .remove();
        }
    }

    let graphData = {
        bareNodeLinks: [],
        numberOfLayers: 0,
        nodeMapping: new Map()
    };
    let currentBareNodeLinks = null;
    let dateDimension = null;
    let minDate = null;
    let filteredMinDate = null;
    let maxDate = null;
    let filteredMaxDate = null;
    let hits = null;

    class DataManager {
        static initGraphData(data) {
            DataManager.initBareNodeLinks(data);
            DataManager.initNodeMapping(data);
        }

        static initBareNodeLinks(data) {
            graphData.bareNodeLinks = data.links.map(link => {
                return new Link(link.source, link.target, new Date(link.date));
            });
        }

        static initNodeMapping(data) {
            graphData.numberOfLayers = data.numberOfLayers;
            data.nodeMapping.forEach(nodeLayerIndexGroup => {
                graphData.nodeMapping.set(nodeLayerIndexGroup["layer" + graphData.numberOfLayers].toString(), nodeLayerIndexGroup);
            });
        }

        static initCrossfilter() {
            dateDimension = crossfilter(graphData.bareNodeLinks).dimension(link => link.date);

            minDate = dateDimension.bottom(1)[0].date;
            filteredMinDate = minDate;

            maxDate = dateDimension.top(1)[0].date;
            filteredMaxDate = maxDate;

            hits = dateDimension.group().reduceSum(() => 1);

            currentBareNodeLinks = dateDimension.top(Number.POSITIVE_INFINITY);
        }
    }

    class TimeSlicer {
        static init() {
            TimeSlicer.setActive(false);
            let timeSlicer = dc.barChart("#time-slicer");

            timeSlicer
                .width(componentStructure.timeSlicer.width)
                .height(componentStructure.timeSlicer.height)
                .dimension(dateDimension)
                .group(hits)
                .x(d3.time.scale().domain([minDate, maxDate]).nice(d3.time.day))
                .elasticX(true)
                .centerBar(true)
                .xUnits(d3.time.days)
                .xAxisPadding(12).xAxisPaddingUnit('hour');

            timeSlicer.on("filtered", function () {
                let filteredBareNodeLinks = dateDimension.top(Number.POSITIVE_INFINITY);

                let minDateEntry = dateDimension.bottom(1)[0];
                let currentMinDate = minDateEntry ? minDateEntry.date : null;

                let maxDateEntry = dateDimension.top(1)[0];
                let currentMaxDate = maxDateEntry ? maxDateEntry.date : null;

                if (currentMinDate !== filteredMinDate || currentMaxDate !== filteredMaxDate) {
                    filteredMinDate = currentMinDate;
                    filteredMaxDate = currentMaxDate;
                    currentBareNodeLinks = filteredBareNodeLinks;
                    NodeDrawingComponent.removeNeighbours();
                    Graph.update(true, false);
                }
            });

            dc.renderAll();
        }

        static setActive(active) {
            d3.select("#time-slicer").style("visibility", () => {
                if (active) {
                    return "visible";
                }
                else {
                    return "hidden";
                }
            });
        }
    }

    const forceLayoutParameter = Object.create({
        charge: -120,
        friction: 0.5
    });

    class GraphLayoutManager {
        static initForceLayout(graphPart) {
            let force = d3.layout.force()
                .nodes(graphPart.nodes)
                .links(graphPart.links)
                .size([componentStructure.graph.width / Math.pow(2, graphPart.layer), componentStructure.graph.height / Math.pow(2, graphPart.layer - 1)])
                .linkDistance(componentStructure.graph.height / Math.pow(2, graphPart.layer - 1) / 4)
                .charge(forceLayoutParameter.charge)
                .friction(forceLayoutParameter.friction);

            return new Promise((resolve) => {
                force.on("end", () => {
                    resolve();
                });
                force.start();
            });
        }
    }

    let searchString = "";

    class SearchBar {
        static init() {
            let searchBar = d3.select("#search-bar");
            searchBar.style("visibility", "hidden");

            var input = searchBar.append("input").on("input", function () {
                SearchBar.updateSearchString(this.value);
            });

            searchBar.append("i")
                .attr("class", "fa fa-lg fa-times-circle button-remove-search")
                .on("click", () => {
                    input.property("value", "");
                    SearchBar.updateSearchString("");
                });
        }

        static updateSearchString(value) {
            searchString = value;
            d3.select(".fa.fa-lg.fa-times-circle.button-remove-search").style("visibility", SearchBar.getSearchStringVisibility);
            Graph.update(false, false);
        }

        static getSearchStringVisibility() {
            if (searchString === "") {
                return "hidden";
            }
            else {
                return "visible";
            }
        }

        static setActive(active) {
            d3.select("#search-bar").style("visibility", () => {
                if (active) {
                    return "visible";
                }
                else {
                    return "hidden";
                }
            });
        }
    }

    let svg = null;
    let graphParts = new Map();
    let topLayerOpenNodeDrawingComponents = [];
    let currentCrossConnectionLinks = new Map();
    let currentCrossConnectionNodes = new Map();

    class Graph {
        static initSvg() {
            svg = d3.select("#graph")
                .append("svg")
                .attr("width", componentStructure.graph.width)
                .attr("height", componentStructure.graph.height);
            svg.append("line")
                .attr("class", "link-insert-position")
                .style("visibility", "hidden");
        }

        static initGraphPart(layer, parent) {
            LoadingAnimation.create(parent);
            let graphPart = new GraphPart(layer, parent);
            graphParts.set(parent ? parent.name : "top", graphPart);
            GraphLayoutManager.initForceLayout(graphPart).then(() => {
                if (!graphPart.parent) {
                    TimeSlicer.setActive(true);
                    SearchBar.setActive(true);
                }
                graphPart.setActive(true);
                Graph.update(false, false);
            });
        }

        static isInCluster(bareNode, cluster) {
            return cluster.name === graphData.nodeMapping.get(bareNode)["layer" + cluster.layer];
        }

        static update(filterChanged, openNodeChanged) {
            graphParts.forEach(function (graphPart) {
                if (filterChanged) {
                    graphPart.updateLinks();
                }

                let linkSelection = svg.selectAll(".link.layer" + graphPart.layer + (graphPart.parent ? (".parent-node-" + graphPart.parent.name) : "")).data(graphPart.links);
                let nodeSelection = svg.selectAll(".node.layer" + graphPart.layer + (graphPart.parent ? (".parent-node-" + graphPart.parent.name) : "")).data(graphPart.nodes);

                Graph.updateGraphComponents(linkSelection, nodeSelection);
            });

            Graph.updateOpenNodes(topLayerOpenNodeDrawingComponents, filterChanged || openNodeChanged);
        }

        static updateOpenNodes(openNodeDrawingComponents, recompute) {
            if (openNodeDrawingComponents && openNodeDrawingComponents.length > 0) {
                let currentLayer = openNodeDrawingComponents[0].datum().layer;

                if (recompute || !currentCrossConnectionLinks.get(currentLayer) || !currentCrossConnectionNodes.get(currentLayer)) {
                    let openNodeNames = Array.from(openNodeDrawingComponents, ondc => ondc.datum().name);
                    let allAvailableChildLayerNodes = [];

                    graphParts.forEach(graphPart => {
                        if (graphPart.layer === currentLayer + 1) {
                            allAvailableChildLayerNodes = allAvailableChildLayerNodes.concat(graphPart.nodes);
                        }
                    });

                    let crossConnectionLinks = Graph.getCrossConnectionLinks(currentLayer, openNodeNames, allAvailableChildLayerNodes);
                    crossConnectionLinks.forEach(link => link.isActive = true);

                    currentCrossConnectionLinks.set(currentLayer, crossConnectionLinks);
                    currentCrossConnectionNodes.set(currentLayer, allAvailableChildLayerNodes);
                }

                let linkSelection = svg
                    .selectAll(".link.layer" + (currentLayer + 1) + ".cross-connection")
                    .data(currentCrossConnectionLinks.get(currentLayer));

                let nodeSelection = svg
                    .selectAll(".node.layer" + (currentLayer + 1))
                    .data(currentCrossConnectionNodes.get(currentLayer));

                Graph.updateGraphComponents(linkSelection, nodeSelection);

                let allChildOpenNodeDrawingComponents = [];
                openNodeDrawingComponents.forEach(ondc => allChildOpenNodeDrawingComponents = allChildOpenNodeDrawingComponents.concat(ondc.datum().openNodes));
                Graph.updateOpenNodes(allChildOpenNodeDrawingComponents, recompute);
            }
        }

        static getCrossConnectionLinks(currentLayer, openNodeNames, allAvailableChildLayerNodes) {
            let weightedLinks = [];

            currentBareNodeLinks.map(link => {
                let layeredSourceId = graphData.nodeMapping.get(link.source)["layer" + (currentLayer + 1)];
                let layeredTargetId = graphData.nodeMapping.get(link.target)["layer" + (currentLayer + 1)];
                let layeredSourceParentId = graphData.nodeMapping.get(link.source)["layer" + currentLayer];
                let layeredTargetParentId = graphData.nodeMapping.get(link.target)["layer" + currentLayer];

                if (layeredSourceParentId !== layeredTargetParentId && openNodeNames.includes(layeredSourceParentId) && openNodeNames.includes(layeredTargetParentId)) {
                    let sourceNode = allAvailableChildLayerNodes.find(node => node.name === layeredSourceId);
                    let targetNode = allAvailableChildLayerNodes.find(node => node.name === layeredTargetId);

                    if (sourceNode && targetNode) {
                        return new Link(sourceNode, targetNode, link.date);
                    }
                    else {
                        return undefined;
                    }
                }
            }).filter(link => link && link.source.name !== link.target.name)
                .forEach(link => Link.weightLink(link, weightedLinks));

            return weightedLinks;
        }

        static updateGraphComponents(linkSelection, nodeSelection) {
            LinkDrawingComponent.enter(linkSelection);
            LinkDrawingComponent.update(linkSelection);
            LinkDrawingComponent.exit(linkSelection);

            NodeDrawingComponent.enter(nodeSelection);
            NodeDrawingComponent.update(nodeSelection);
        }
    }

    class GraphPart {
        constructor(layer, parent) {
            this.links = [];
            this.nodes = {};
            this.layer = layer;
            this.parent = parent;
            this.assignBareNodeLinks();
            this.resolveBareNodes();
        }

        assignBareNodeLinks() {
            this.links = graphData.bareNodeLinks.map(link => {
                let copiedLinkProperties = Object.assign({}, link);
                return new Link(copiedLinkProperties.source, copiedLinkProperties.target, copiedLinkProperties.date);
            });

            if (this.parent) {
                this.links = this.links.filter(link => Graph.isInCluster(link.source, this.parent) && Graph.isInCluster(link.target, this.parent));
            }
        }

        resolveBareNodes() {
            this.links.forEach(link => {
                let layeredSourceId = graphData.nodeMapping.get(link.source)["layer" + this.layer];
                let layeredTargetId = graphData.nodeMapping.get(link.target)["layer" + this.layer];

                if (!this.nodes[layeredSourceId]) {
                    this.nodes[layeredSourceId] = new Node(layeredSourceId, this.layer, this.parent);
                }
                if (!this.nodes[layeredTargetId]) {
                    this.nodes[layeredTargetId] = new Node(layeredTargetId, this.layer, this.parent);
                }
            });
            this.nodes = d3.values(this.nodes);
            if (this.parent) {
                this.nodes.forEach(node => node.scale(this.parent.scaleFactor));
            }
            this.links = this.getWeightedLinks(true);
        }

        updateLinks() {
            this.links = this.getWeightedLinks();
            this.links.forEach(link => link.isActive = true);
        }

        getWeightedLinks(ignoreFilter) {
            let filteredBareNodeLinks = ignoreFilter ? graphData.bareNodeLinks : currentBareNodeLinks;

            if (graph.parent) {
                filteredBareNodeLinks = filteredBareNodeLinks.filter(link => Graph.isInCluster(link.source, this.parent) && Graph.isInCluster(link.target, this.parent));
            }

            let weightedLinks = [];

            filteredBareNodeLinks
                .map(link => {
                    let layeredSourceId = graphData.nodeMapping.get(link.source)["layer" + this.layer];
                    let sourceNode = this.nodes.find(node => node.name === layeredSourceId);
                    let layeredTargetId = graphData.nodeMapping.get(link.target)["layer" + this.layer];
                    let targetNode = this.nodes.find(node => node.name === layeredTargetId);
                    if (sourceNode && targetNode) {
                        return new Link(sourceNode, targetNode, link.date);
                    }
                    else {
                        return undefined;
                    }
                }).filter(link => link && link.source !== link.target)
                .forEach(link => Link.weightLink(link, weightedLinks));

            return weightedLinks;
        }

        setActive(active) {
            this.nodes.forEach((node) => {
                node.isActive = active;
            });
            this.links.forEach((link) => {
                link.isActive = active;
            });
            if (active) {
                LoadingAnimation.remove(this.parent);
            }
        }
    }

    let selectedNode;
    let selectedNodeNeighbours = [];
    let selectionActivated = false;
    const maxOpenNodes = 2;
    const nodeProperty = Object.freeze({
        circle: Object.freeze({
            color: Object.freeze({
                default: "#CCCCCC",
                primary: "#F70000",
                secondary: "#F6CD00"
            }),
            stroke: Object.freeze({
                primary: "seagreen",
                default: "black"
            }),
            strokeWidth: Object.freeze({
                primary: 2,
                default: 1
            }),
            radius: Object.freeze({
                primary: 12,
                secondary: 10,
                default: 8,
                min: 4
            })
        }),
        textNodeName: Object.freeze({
            offsetY: Object.freeze({
                default: ".4em",
                primary: "1em"
            }),
            fontSize: Object.freeze({
                default: "0.8rem",
                primary: "1.5rem"
            })
        }),
        rectOpenNode: Object.freeze({
            stroke: Object.freeze({
                default: "#CCCCCC",
                primary: "#F70000",
                secondary: "#F6CD00"
            }),
            fill: Object.freeze({
                default: "#DEEEF0"
            }),
            radiusX: Object.freeze({
                default: 15
            }),
            radiusY: Object.freeze({
                default: 15
            })
        }),
        rectMax: Object.freeze({
            stroke: Object.freeze({
                default: "grey"
            }),
            fill: Object.freeze({
                default: "white"
            }),
            opacity: Object.freeze({
                default: 0.2,
                primary: 1
            }),
            offsetX: Object.freeze({
                default: 15
            }),
            offsetY: Object.freeze({
                default: 30
            }),
            width: Object.freeze({
                default: 40
            }),
            height: Object.freeze({
                default: 30
            }),
        }),
        textMax: Object.freeze({
            fontSize: Object.freeze({
                default: "1.5rem"
            }),
            fill: Object.freeze({
                default: "grey"
            }),
            offsetX: Object.freeze({
                default: 10
            }),
            offsetY: Object.freeze({
                default: 23
            })
        })
    });

    class NodeDrawingComponent {
        static getNodeClass(node) {
            let value = "node layer" + node.layer;
            if (node.parent) {
                value += " parent-node-" + node.parent.name;
            }
            return value;
        }

        static getCircleColor(node) {
            if (node.selectionRelation === selectionRelation.self || node.selectionRelation === selectionRelation.child) {
                return nodeProperty.circle.color.primary;
            } else if (node.selectionRelation === selectionRelation.neighbour || node.selectionRelation === selectionRelation.neighbourChild) {
                return nodeProperty.circle.color.secondary;
            } else {
                return nodeProperty.circle.color.default;
            }
        }

        static getCircleVisibility(node) {
            if (node.isOpen() || !node.isActive) {
                return defaultProperty.visibility.hidden;
            }
            else {
                return defaultProperty.visibility.visible;
            }
        }

        static isSearchResult(node) {
            let nodeMappingsSearchResult = graphData.nodeMapping.get(searchString);
            if (nodeMappingsSearchResult) {
                return node.name === nodeMappingsSearchResult["layer" + node.layer];
            }
            return false;
        }

        static getCircleStroke(node) {
            if (NodeDrawingComponent.isSearchResult(node)) {
                return nodeProperty.circle.stroke.primary;
            }
            else {
                return nodeProperty.circle.stroke.default;
            }
        }

        static getCircleStrokeWidth(node) {
            if (NodeDrawingComponent.isSearchResult(node)) {
                return nodeProperty.circle.strokeWidth.primary;
            }
            else {
                return nodeProperty.circle.strokeWidth.default;
            }
        }

        static getCircleRadius(node) {
            let value = null;
            if (NodeDrawingComponent.isSearchResult(node)) {
                value = nodeProperty.circle.radius.primary;
            }
            else {
                if (node.isVisited || node.selectionRelation === selectionRelation.self || node.selectionRelation === selectionRelation.child) {
                    value = nodeProperty.circle.radius.primary;
                } else if (node.selectionRelation === selectionRelation.neighbour || node.selectionRelation === selectionRelation.neighbourChild) {
                    value = nodeProperty.circle.radius.secondary;
                } else {
                    value = nodeProperty.circle.radius.default;
                }
            }
            return value - (node.layer / Math.sqrt(node.scaleFactor) - 1) * ((nodeProperty.circle.radius.default - nodeProperty.circle.radius.min) / graphData.numberOfLayers);
        }

        static getCircleCenterValueX(node) {
            return node.getXValue();
        }

        static getCircleCenterValueY(node) {
            return node.getYValue();
        }

        static circleMouseOver(node) {
            let selection = d3.select(this.parentNode);
            node.isVisited = true;
            NodeDrawingComponent.update(selection);
        }

        static circleMouseOut(node) {
            let selection = d3.select(this.parentNode);
            node.isVisited = false;
            NodeDrawingComponent.update(selection);
        }

        static circleClick(node) {
            NodeDrawingComponent.toggleSelection(node);
            Graph.update(false, false);
        }

        static circleDoubleClick(node) {
            let nodeDrawingComponent = d3.select(this.parentElement);

            if (!node.isMaximized) {
                if (node.layer < graphData.numberOfLayers) {
                    if (node.isOpen()) {
                        node.openNodeIndex = -1;
                        node.offsetX = 0;
                        node.offsetY = 0;
                        NodeDrawingComponent.removeOpenNodes(node);
                        Graph.update(false, true);
                    }
                    else {
                        let openNodes = node.parent ? node.parent.openNodes : topLayerOpenNodeDrawingComponents;

                        if (openNodes.length < maxOpenNodes) {
                            node.offsetX = componentStructure.graph.width / Math.pow(2, node.layer) - node.x;
                            openNodes.push(nodeDrawingComponent);

                            openNodes.forEach(function (openNodeDrawingComponent, index) {
                                let openNode = openNodeDrawingComponent.datum();
                                openNode.openNodeIndex = index;
                                openNode.offsetY = openNode.openNodeIndex * componentStructure.graph.height / Math.pow(2, openNode.layer - 1) / openNodes.length - openNode.y;
                            });

                            Graph.initGraphPart(node.layer + 1, node);
                            Graph.update(false, true);
                        }
                    }
                }
            }
        }

        static toggleSelection(node) {
            if (selectionActivated) {
                if (selectedNode.selectionRelation === node.selectionRelation) {
                    selectionActivated = false;
                    NodeDrawingComponent.removeCurrentSelection();
                }
                else {
                    NodeDrawingComponent.removeCurrentSelection();
                    NodeDrawingComponent.setNodeSelected(node);
                }
            }
            else {
                NodeDrawingComponent.setNodeSelected(node);
            }
        }

        static setNodeSelected(node) {
            selectionActivated = true;
            selectedNode = node;
            selectedNode.selectionRelation = selectionRelation.self;
            let parent = selectedNode.parent;
            while (parent) {
                parent.selectionRelation = selectionRelation.child;
                parent = parent.parent;
            }
        }

        static removeCurrentSelection() {
            selectedNode.selectionRelation = selectionRelation.none;
            let parent = selectedNode.parent;
            while (parent) {
                parent.selectionRelation = selectionRelation.none;
                parent = parent.parent;
            }
            NodeDrawingComponent.removeNeighbours();
        }

        static removeNeighbours() {
            selectedNodeNeighbours.forEach(node => {
                node.selectionRelation = selectionRelation.none;
            });
            selectedNodeNeighbours = [];
        }

        static removeOpenNodes(node) {
            if (node) {
                graphParts.delete(node.name);
                svg.selectAll(".link.layer" + (node.layer + 1) + ".parent-node-" + node.name).remove();
                svg.selectAll(".node.layer" + (node.layer + 1) + ".parent-node-" + node.name).remove();
                LoadingAnimation.remove(node);

                node.openNodes.forEach(openNode => {
                    NodeDrawingComponent.removeOpenNodes(openNode.datum());
                });

                if (node.parent) {
                    node.parent.openNodes = node.parent.openNodes.filter(nodeDrawingComponent => {
                        return nodeDrawingComponent.datum().name !== node.name;
                    });
                }
                else {
                    topLayerOpenNodeDrawingComponents = topLayerOpenNodeDrawingComponents.filter(nodeDrawingComponent => {
                        return nodeDrawingComponent.datum().name !== node.name;
                    });
                }
            }
        }

        static getTextNodeNameText(node) {
            if (node.isOpen()) {
                return node.name;
            }
            else if (node.selectionRelation === selectionRelation.neighbourChild) {
                return node.selectedNodeNeighbourCount;
            }
            else {
                return node.name;
            }
        }

        static getTextNodeNameOffsetX(node) {
            if (node.selectionRelation === selectionRelation.neighbourChild && !node.isOpen())
                return -(Math.round(node.selectedNodeNeighbourCount / 10, 0) + 1) * 2.5;
            else {
                return 18;
            }
        }
        static getTextNodeNameOffsetY(node) {
            if (node.isOpen()) {
                return nodeProperty.textNodeName.offsetY.primary;
            }
            else {
                return nodeProperty.textNodeName.offsetY.default;
            }
        }

        static getTextNodeNameVisibility(node) {
            if (node.isActive && (node.isVisited || node.selectionRelation === selectionRelation.self || node.isOpen() || node.selectionRelation === selectionRelation.neighbourChild)) {
                return defaultProperty.visibility.visible;
            }
            else {
                return defaultProperty.visibility.hidden;
            }
        }

        static getTextNodeNameFontSize(node) {
            if (node.isOpen()) {
                return nodeProperty.textNodeName.fontSize.primary;
            } else {
                return nodeProperty.textNodeName.fontSize.default;
            }
        }

        static getTextNodeNameXValue(node) {
            return node.getXValue();
        }

        static getTextNodeNameYValue(node) {
            return node.getYValue();
        }

        static getRectOpenNodeStroke(node) {
            if (node.selectionRelation === selectionRelation.self || node.selectionRelation === selectionRelation.child) {
                return nodeProperty.rectOpenNode.stroke.primary;
            } else if (node.selectionRelation === selectionRelation.neighbour || node.selectionRelation === selectionRelation.neighbourChild) {
                return nodeProperty.rectOpenNode.stroke.secondary;
            } else {
                return nodeProperty.rectOpenNode.stroke.default;
            }
        }

        static getRectOpenNodeVisibility(node) {
            if (node.isOpen() && node.isActive) {
                return defaultProperty.visibility.visible;
            }
            else {
                return defaultProperty.visibility.hidden;
            }
        }

        static getRectOpenNodeXValue(node) {
            return node.getXValue();
        }

        static getRectOpenNodeYValue(node) {
            let value = node.getYValue();
            value += openNodeProperty.margin;
            return value;
        }

        static getRectOpenNodeWidth(node) {
            return (componentStructure.graph.width / Math.pow(2, node.layer)) * node.scaleFactor - openNodeProperty.margin;
        }

        static getRectOpenNodeHeight(node) {
            return (componentStructure.graph.height / Math.pow(2, node.layer - 1)) * node.scaleFactor / maxOpenNodes - 2 * openNodeProperty.margin;
        }

        static getRectMaxVisibility(node) {
            if (pendingLoadingOperations.length === 0 && node.isOpen() && node.isActive) {
                return defaultProperty.visibility.visible;
            }
            else {
                return defaultProperty.visibility.hidden;
            }
        }

        static getRectMaxXValue(node) {
            let value = node.getXValue();
            value += nodeProperty.rectMax.offsetX.default;
            return value;
        }

        static getRectMaxYValue(node) {
            let value = node.getYValue();
            value += nodeProperty.rectMax.offsetY.default;
            return value;
        }

        static getTextMaxText(node) {
            if (node.isMaximized) {
                return "\uf146";
            }
            else {
                return "\uf0b2";
            }
        }

        static rectMaxMouseOver() {
            d3.select(this).style("opacity", nodeProperty.rectMax.opacity.primary);
        }

        static rectMaxMouseOut() {
            d3.select(this).style("opacity", nodeProperty.rectMax.opacity.default);
        }

        static rectMaxClick(node) {
            node.toggleMaximization();
            Graph.update(false, false);
        }

        static enter(selection) {
            var nodeGroupEnter = selection.enter()
                .append("g")
                .attr("class", NodeDrawingComponent.getNodeClass);

            nodeGroupEnter.append("circle")
                .on("mouseover", NodeDrawingComponent.circleMouseOver)
                .on("mouseout", NodeDrawingComponent.circleMouseOut)
                .on("click", NodeDrawingComponent.circleClick)
                .on("dblclick", NodeDrawingComponent.circleDoubleClick);

            nodeGroupEnter.append("text")
                .attr("class", "node-name");

            nodeGroupEnter.append("rect")
                .attr("class", "open-node")
                .attr("rx", nodeProperty.rectOpenNode.radiusX.default)
                .attr("ry", nodeProperty.rectOpenNode.radiusY.default)
                .style("fill", nodeProperty.rectOpenNode.fill.default)
                .style("opacity", 1 / (2 * maxOpenNodes))
                .on("click", NodeDrawingComponent.circleClick)
                .on("dblclick", NodeDrawingComponent.circleDoubleClick);
            nodeGroupEnter.append("rect")
                .attr("class", "max")
                .style("fill", nodeProperty.rectMax.fill.default)
                .style("opacity", nodeProperty.rectMax.opacity.default)
                .style("stroke", nodeProperty.rectMax.stroke.default)
                .on("mouseover", NodeDrawingComponent.rectMaxMouseOver)
                .on("mouseout", NodeDrawingComponent.rectMaxMouseOut)
                .on("click", NodeDrawingComponent.rectMaxClick);
            nodeGroupEnter.append("text")
                .attr("class", "max")
                .attr("visibility", defaultProperty.visibility.hidden);
        }

        static update(selection) {
            selection.selectAll("circle")
                .style("fill", NodeDrawingComponent.getCircleColor)
                .style("visibility", NodeDrawingComponent.getCircleVisibility)
                .transition()
                .style("stroke", NodeDrawingComponent.getCircleStroke)
                .style("stroke-width", NodeDrawingComponent.getCircleStrokeWidth)
                .attr("r", NodeDrawingComponent.getCircleRadius)
                .attr("cx", NodeDrawingComponent.getCircleCenterValueX)
                .attr("cy", NodeDrawingComponent.getCircleCenterValueY);

            selection.selectAll("text.node-name")
                .text(NodeDrawingComponent.getTextNodeNameText)
                .attr("dx", NodeDrawingComponent.getTextNodeNameOffsetX)
                .attr("dy", NodeDrawingComponent.getTextNodeNameOffsetY)
                .style("visibility", NodeDrawingComponent.getTextNodeNameVisibility)
                .style("white-space", "pre")
                .style("font-size", NodeDrawingComponent.getTextNodeNameFontSize)
                .transition()
                .attr("x", NodeDrawingComponent.getTextNodeNameXValue)
                .attr("y", NodeDrawingComponent.getTextNodeNameYValue);

            selection.selectAll("rect.open-node")
                .style("stroke", NodeDrawingComponent.getRectOpenNodeStroke)
                .style("visibility", NodeDrawingComponent.getRectOpenNodeVisibility)
                .attr("x", NodeDrawingComponent.getRectOpenNodeXValue)
                .attr("y", NodeDrawingComponent.getRectOpenNodeYValue)
                .attr("width", NodeDrawingComponent.getRectOpenNodeWidth)
                .attr("height", NodeDrawingComponent.getRectOpenNodeHeight);

            selection.selectAll("rect.max")
                .style("visibility", NodeDrawingComponent.getRectMaxVisibility)
                .attr("x", NodeDrawingComponent.getRectMaxXValue)
                .attr("y", NodeDrawingComponent.getRectMaxYValue)
                .attr("width", nodeProperty.rectMax.width.default)
                .attr("height", nodeProperty.rectMax.height.default);

            selection.selectAll("text.max")
                .style("visibility", NodeDrawingComponent.getRectMaxVisibility)
                .style("font-size", nodeProperty.textMax.fontSize.default)
                .attr("fill", nodeProperty.textMax.fill.default)
                .attr("x", NodeDrawingComponent.getRectMaxXValue)
                .attr("y", NodeDrawingComponent.getRectMaxYValue)
                .attr("dx", nodeProperty.textMax.offsetX.default)
                .attr("dy", nodeProperty.textMax.offsetY.default)
                .text(NodeDrawingComponent.getTextMaxText);
        }
    }

    let pendingLoadingOperations = [];
    const numberOfLoadingBubbles = 5;

    class LoadingAnimation {
        static remove(node) {
            d3.select(".cssload-loader-walk.layer" + (node ? ((node.layer + 1) + ".parent-node-" + node.name) : "1")).remove();
            if (node && pendingLoadingOperations.includes(node.name)) {
                pendingLoadingOperations.splice(pendingLoadingOperations.indexOf(node.name), 1);
            }
        }

        static getLeftOffset(node) {
            let value = -50;
            if (node) {
                value += node.getXValue();
                value += componentStructure.graph.width / (2 * Math.pow(2, node.layer)) * node.scaleFactor;
                value -= openNodeProperty.margin * Math.pow(2, node.layer - 1);
            }
            else {
                value += componentStructure.graph.width / 2;
            }
            return Math.round(value, 0) + "px";
        }

        static getTopOffset(node) {
            let value = componentStructure.searchBar.height;
            if (node) {
                value += node.getYValue();
                value += componentStructure.graph.height / Math.pow(2, node.layer - 1) * node.scaleFactor / (2 * maxOpenNodes);
            }
            else {
                value += componentStructure.graph.height / 2;
            }
            return Math.round(value, 0) + "px";
        }

        static create(node) {
            if (node) {
                pendingLoadingOperations.push(node.name);
            }

            let loadingAnimationContainer = d3.select("body")
                .append("div")
                .attr("class", "cssload-loader-walk layer" + (node ? ((node.layer + 1) + " parent-node-" + node.name) : "1"))
                .style("left", () => LoadingAnimation.getLeftOffset(node))
                .style("top", () => LoadingAnimation.getTopOffset(node));

            for (let i = 0; i < numberOfLoadingBubbles; i++) {
                loadingAnimationContainer.append("div");
            }
        }
    }

    let generatedLinks = [];
    const numberOfLayer2IntraClusterLinks = 1000;
    const numberOfLayer1IntraClusterLinks = 30;
    const numberOfLayer1InterClusterLinks = 10;

    class LinkGenerator {
        static start() {
            LinkGenerator.generateLayer2IntraClusterLinks();
            LinkGenerator.generateLayer1IntraClusterLinks();
            LinkGenerator.generateLayer1InterClusterLinks();
        }

        static generateLayer2IntraClusterLinks() {
            for (let clusterIndex = 0; clusterIndex < 9; clusterIndex++) {
                for (let i = 0; i < numberOfLayer2IntraClusterLinks; i++) {
                    let source = Math.floor((Math.random() * 10) + clusterIndex * 10);
                    let target = Math.floor((Math.random() * 10) + clusterIndex * 10);

                    while (source === target) {
                        target = Math.floor((Math.random() * 10) + clusterIndex * 10);
                    }

                    generatedLinks.push({
                        source: source.toString(),
                        target: target.toString(),
                        date: "2010-01-" + Math.floor((Math.random() * 31) + 1)
                    });
                }
            }
        }

        static generateLayer1IntraClusterLinks() {
            for (let clusterIndex = 0; clusterIndex < 3; clusterIndex++) {
                for (let i = 0; i < numberOfLayer1IntraClusterLinks; i++) {
                    let source = Math.floor((Math.random() * 30) + clusterIndex * 30);
                    let target = Math.floor((Math.random() * 30) + clusterIndex * 30);
                    while (Math.floor(source / 10) === Math.floor(target / 10)) {
                        target = Math.floor((Math.random() * 30) + clusterIndex * 30);
                    }

                    generatedLinks.push({
                        source: source.toString(),
                        target: target.toString(),
                        date: "2010-01-" + Math.floor((Math.random() * 31) + 1)
                    });
                }
            }
        }

        static generateLayer1InterClusterLinks() {
            for (let i = 0; i < numberOfLayer1InterClusterLinks; i++) {
                let source = Math.floor(Math.random() * 90);
                let target = Math.floor(Math.random() * 90);
                while (Math.floor(source / 30) === Math.floor(target / 30)) {
                    target = Math.floor(Math.random() * 90);
                }

                generatedLinks.push({
                    source: source.toString(),
                    target: target.toString(),
                    date: "2010-01-" + Math.floor((Math.random() * 31) + 1)
                });
            }
        }
    }

    LinkGenerator.start();

    SearchBar.init();
    Graph.initSvg();

    d3.json("data.json", function (data) {
        data.links = generatedLinks;
        DataManager.initGraphData(data);
        DataManager.initCrossfilter();
        TimeSlicer.init();
        Graph.initGraphPart(1);
    });
})();