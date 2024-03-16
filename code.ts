type BaseTypeNode = (BaseNodeMixin & { type: NodeType });

type BaseParentNode = (BaseTypeNode & ChildrenMixin & DimensionAndPositionMixin) | null;

type PropsType = BaseFrameMixin & LayoutMixin & BlendMixin & ConstraintMixin & ExportMixin & BaseNodeMixin;
const isSymbol = (node:BaseTypeNode) => node.type == "COMPONENT" || node.type == "INSTANCE";
const isContainer = (node:BaseTypeNode) => node.type == "GROUP" || node.type == "FRAME";

const sortByDepth = (a: SceneNode, b: SceneNode) => a.parent.children.indexOf(a) - b.parent.children.indexOf(b);

function getValidParent(parent:BaseParentNode, parents:BaseParentNode[] = []):BaseParentNode {
	if (parent.type == "PAGE" && parents.length == 0) {
		return parent;
	} else if (parent.type != "DOCUMENT") {
		parents.unshift(parent);
		return getValidParent(parent.parent as BaseParentNode, parents);
	} else {
		for (const parent of parents) if (isSymbol(parent)) return parent;
		return parents[parents.length - 1];
	}
}

function moveComponents(node: BaseParentNode, moved: ComponentNode[] = []) {
	node.children.forEach((child) => {
		switch (child.type) {
			case "COMPONENT": {
				const component = child as ComponentNode;
				const instance = component.createInstance();
				instance.x = component.x;
				instance.y = component.y;
				node.insertChild(node.children.indexOf(component), instance);
				moved.push(component);
				break;
			}
			case "FRAME":
			case "GROUP": {
				moveComponents(child, moved);
				break;
			}
			default:
		}
	});
}

function copyProps(component: ComponentNode, from: PropsType, type: NodeType) {

	if (type == "FRAME") {
		component.layoutGrids = from.layoutGrids;
		component.gridStyleId = from.gridStyleId;
		component.clipsContent = from.clipsContent;
		component.guides = from.guides;
	}

	component.opacity = from.opacity;
	component.blendMode = from.blendMode;
	component.isMask = from.isMask;
	component.effects = from.effects;
	component.effectStyleId = from.effectStyleId;
	component.exportSettings = from.exportSettings;
	component.rotation = from.rotation;

	if (type != "GROUP") component.constraints = from.constraints;

	if (from.backgrounds) {
		component.backgrounds = from.backgrounds;
		component.backgroundStyleId = from.backgroundStyleId;
	}
}

const selection = figma.currentPage.selection;

let note = null;

const select = [];

if (selection.length > 0) {

	const instances = [];

	const groups:Map<String, SceneNode[]> = new Map();

	selection.forEach(node => {
		const pn = node.parent.id;
		let sets = groups.has(pn) ? groups.get(pn) : groups.set(pn, []).get(pn);
		sets.push(node);
	});

	groups.forEach(nodes => {

		let indexShift = nodes.length;

		nodes.sort(sortByDepth);

		let first = nodes[0];
		let last = nodes[nodes.length - 1];

		const parent = first.parent;

		let index = parent.children.indexOf(last) + 1;

		let validParent = getValidParent(parent as BaseParentNode);

		if (validParent.type == "INSTANCE") {
			instances.push(validParent as InstanceNode);
			return;
		}

		const moved:ComponentNode[] = [];
		nodes.forEach(node => {
			if (isContainer(node)) moveComponents(node as BaseParentNode, moved);
		});

		nodes.sort(sortByDepth);

		nodes = nodes.map(node => {
			if (node.type == "COMPONENT") {
				const instance = node.createInstance();
				instance.x = node.x;
				instance.y = node.y;
				indexShift--;
				return instance;
			}
			return node;
		});

		first = nodes[0];
		last = nodes[nodes.length - 1];

		const name = last.name;

		let nx = first.x;
		let ny = first.y;
		nodes.forEach(n => {
			nx = Math.min(nx, n.x);
			ny = Math.min(ny, n.y);
		});

		const container = nodes.length == 1 && isContainer(first);
		let group: FrameNode | GroupNode = container ? (first as FrameNode) : figma.group(nodes, parent);

		let component = figma.createComponent();
		component.x = nx;
		component.y = ny;
		component.resize(group.width, group.height);

		const isFrame = group.type == "FRAME";

		if (container) {
			copyProps(component, group as PropsType, group.type);
		} else if (nodes.length == 1) {
			copyProps(component, first as PropsType, first.type);
		}

		const gx = group.x;
		const gy = group.y;

		const mx = component.x + component.width + 64;
		let my = component.y;

		moved.forEach((m) => {
			validParent.appendChild(m);
			m.x = mx;
			m.y = my;
			my += m.height + 64;
		});

		group.children.forEach(node => {
			if (!isFrame) {
				node.x -= gx;
				node.y -= gy;
			}
			component.appendChild(node);
		});

		if (isFrame) group.remove();

		component.name = name;

		if (isSymbol(validParent)) {

			const instance = component.createInstance();
			instance.x = component.x;
			instance.y = component.y;

			parent.children.length >= index ? parent.insertChild(index - 1, instance) : parent.appendChild(instance);

			const near = validParent as BaseParentNode;

			component.x = near.x + near.width + 64;
			component.y = near.y;

			(validParent.parent as BaseParentNode).insertChild(parent.parent.children.indexOf(validParent as SceneNode) + 1, component);

		} else {

			validParent.insertChild(index - indexShift, component);
		}

		select.push(component);

	});

	if (instances.length > 0) {
		note = "Can't create components inside instances, try again in master components";
	}
}

if (note) figma.notify(note);

if (select.length > 0) figma.currentPage.selection = select;

figma.closePlugin();