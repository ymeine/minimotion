<script>
  import Player from "../player";
  import { easeInOutCubic } from "../../core/easings";

  async function animation(a) {
	const model = {
		translate1: '0',
		rotation: '0',
		translate2: '0',
		color: null,
		alphabetIndex: 1,
	};

	a.animate({
		target: '.square',
		
		getValue: ({property, target}) => {
			if (property === 'color') {
				return window.getComputedStyle(target)['background-color'];
			}
			return model[property];
		},
		setValue: ({target, property, value}) => {
			model[property] = value;

			const {translate1, rotation, translate2, color} = model;
			target.style['background-color'] = model.color;
			target.style.transform = [
				`translateX(${translate1}px)`,
				`rotate(${rotation}deg)`,
				`translateX(${translate2}px)`,
			].join(' ');
			alphabetIndex = model.alphabetIndex;

			target.firstElementChild.style.transform = `rotate(-${rotation}deg)`
		},

		delay: 200,
		duration: 1000,
		easing: easeInOutCubic,

		translate1: 475,
		rotation: 90,
		translate2: 160,
		color: '#3e4fff',
		alphabetIndex: 26,
	});
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let alphabetIndex = 1;
  $: content = alphabet[Math.round(alphabetIndex) - 1];
</script>

<style>
  div.main {
    position: relative;
    height: 180px;
  }

  div.square {
    position: absolute;
    height: 30px;
    width: 30px;
    top: 0px;
    left: 0px;
    background-color: #fe8820;
	display: grid;
	align-items: center;
	justify-items: center;
  }
</style>

<div class="main">
  <div class="square"><span>{content}</span></div>
</div>
<Player {animation} />
