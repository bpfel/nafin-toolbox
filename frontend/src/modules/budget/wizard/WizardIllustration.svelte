<script lang="ts">
  interface Props {
    step: number
  }

  let { step }: Props = $props()

  const images: Record<number, string> = {
    1: '/illustrations/piggy bank.png',
    2: '/illustrations/income.png',
    3: '/illustrations/health insurance.png',
    4: '/illustrations/house rent.png',
    5: '/illustrations/groceries.png',
    6: '/illustrations/goal.png',
    7: '/illustrations/budget done.png'
  }

  let currentImage = $derived(images[step] || images[1])
</script>

<div class="illustration">
  <img src={currentImage} alt="" />
</div>

<style>
  .illustration {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    margin-bottom: 1rem;
  }

  .illustration img {
    width: auto;
    height: 160px;
    object-fit: contain;
  }

  @media (min-width: 640px) {
    .illustration img {
      height: 200px;
    }
  }
</style>
