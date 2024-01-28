<script lang="ts">
    import ArrowLeftShort from 'bootstrap-icons/icons/arrow-left-short.svg'
</script>

<div class="flex items-center bg-dark text-light p-3">
    <div class="flex-grow">
        <slot/>
    </div>
    <div>
        <slot name="right"/>
    </div>
    <div class="aspect-square flex">
        <a href=".">
            <img src={ArrowLeftShort} alt="" class="w-full text-warning filter-[primary] min-h-[2.5rem]">
        </a>
    </div>
</div>
