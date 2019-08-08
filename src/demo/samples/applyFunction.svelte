<script>
  import Player from "../player";
  import { easeInOutCubic } from "../../core/easings";

  async function animation(a) {
	const model = {
		translate1: 0,
		rotate: 0,
		translate2: 0,
	};

	a.animate({
		target: '.square',
		setValue: (target, property, type, value) => {
			console.log('called');
			model[property] = value;
			const {translate1, rotation, translate2} = model;

			target.style.transform = [
				`translateX(${translate1}px)`,
				`rotate(${rotation}deg)`,
				`translateX(${translate2}px)`,
			].join(' ');
		},

		delay: 200,
		duration: 1000,
		easing: easeInOutCubic,

		translate1: [0, 475],
		rotation: [0, 90],
		translate2: [0, 160],
	});
  }
</script>

<style>
  div.main {
    position: relative;
    height: 180px;
  }

  div.square {
    position: absolute;
    display: inline-block;
    height: 30px;
    width: 30px;
    top: 0px;
    left: 0px;
    background-color: #fe8820;
  }
</style>

<div class="main">
  <div class="square" />
</div>
<Player {animation} />
