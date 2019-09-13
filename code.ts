type BaseTypeNode = (BaseNodeMixin & { type: NodeType });

type BaseParentNode = (BaseTypeNode & DefaultContainerMixin) | null;

type PropsType = FrameMixin & LayoutMixin & BlendMixin & ConstraintMixin & ExportMixin;

const isSymbol = (node:BaseTypeNode) => node.type == "COMPONENT" || node.type == "INSTANCE";
const isContainer = (node:BaseTypeNode) => node.type == "GROUP" || node.type == "FRAME";

function getValidParent(parent:BaseParentNode, parents:Array<BaseParentNode> = []):BaseParentNode {
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

function copyProps(component: ComponentNode, from: PropsType, isFrame = false) {

	if (isFrame) {
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
	component.constraints = from.constraints;
	component.exportSettings = from.exportSettings;
	component.rotation = from.rotation;

	if (from.backgrounds) {
		component.backgrounds = from.backgrounds;
		component.backgroundStyleId = from.backgroundStyleId;
	}
}

const selection = figma.currentPage.selection;

let note = null;

let select = [];

if (selection.length > 0) {

	let groups:Map<String, Array<SceneNode>> = new Map();

	selection.forEach(node => {
		const pn = node.parent.id;
		let sets = groups.has(pn) ? groups.get(pn) : groups.set(pn, []).get(pn);
		sets.push(node);
	});

	groups.forEach(nodes => {
		const first = nodes[0];
		const last = nodes[nodes.length - 1];
		const parent = first.parent;
		const name = last.name;

		if (isSymbol(parent)) {

		}

		let index = parent.children.indexOf(first);

		const container = nodes.length == 1 && isContainer(first);
		let group:FrameNode = container ? (first as FrameNode) : figma.group(nodes, parent);
		let component = figma.createComponent();
		component.x = group.x;
		component.y = group.y;
		component.resize(group.width, group.height);

		const isFrame = group.type == "FRAME";

		if (container) {
			copyProps(component, group, isFrame);
		} else if (nodes.length == 1) {
			console.log(first);
			console.log(first.name);
			copyProps(component, first as PropsType);
		}

		group.children.forEach(node => {
			if (!isFrame) {
				node.x -= component.x;
				node.y -= component.y;
			}
			component.appendChild(node);
		});

		if (isFrame) group.remove();

		component.name = name;
		let validParent = getValidParent(parent as BaseParentNode);

		const near = parent.type != "COMPONENT" ? null : validParent;

		if (near != null) {
			const instance = component.createInstance();
			instance.x = component.x;
			instance.y = component.y;
			parent.insertChild(index, instance);
			component.x = near.x + near.width + 34;
			component.y = near.y;
			index = parent.children.indexOf(near as SceneNode) + 1;
		}

		if (isSymbol(validParent)) validParent = validParent.parent as BaseParentNode;

		console.log(validParent.name);
		validParent.insertChild(index, component);
		select.push(component);
	});
}

if (note) figma.notify(note);

if (select.length > 0) figma.currentPage.selection = select;

figma.closePlugin();