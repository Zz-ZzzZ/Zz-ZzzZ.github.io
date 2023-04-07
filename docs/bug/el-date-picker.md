# el-date-picker使用方式踩坑

el-date-picker组件可使用`v-model`和`value`的形式来绑定组件值，通常`v-model`的形式在大多数情况下使用就足够了，在某些情况下会需要用到绑定`value`来使用，而通过官方文档注册`change`事件时并未触发

## 先上code

```vue
<template>
  <el-date-picker :value="[form.startTime, form.endTime]" type="daterange" />
</template>

<script>
import {defineComponent, reactive} from 'vue'

export default defineComponent({
  setup: () => {
    const form = reactive({
      startTime: '',
      endTime: ''
    })

    return {
      form
    }
  }
})
</script>
```

绑定好`value`后，根据文档所写的`change`事件，注册`change`事件

```vue
<template>
  <el-date-picker :value="[form.startTime, form.endTime]" type="daterange" @change="handleDateChange"/>
</template>

<script>
import { defineComponent, reactive } from 'vue'

export default defineComponent({
  setup: () => {
    const form = reactive({
      startTime: '',
      endTime: ''
    })
    
    const handleDateChange = (value) => {
      // 在这里做一些操作后赋值给form内的startTime和endTime
    }
    
    return {
      form,
      handleDateChange
    }
  }
})
</script>
```

实际在页面中，`change`事件并未如预期那样触发，并且选择的日期也未出现在`input`内，如果是以`v-model`的方式则正常

翻了一下issue，找到了几个相关的issue，从issue内可以看出使用的方式和我一样，解决方案是将注册的`change`事件改为`input`事件
- https://github.com/ElemeFE/element/issues/22292
- https://github.com/ElemeFE/element/issues/18613

## 源码阅读
于是乎，我就翻了一下它的源码看了一下，由于这两个事件都是从选择日期完成后触发，那么先从选择日期触发那一阶段入手，从`Vue DevTool - Timeline`可以看到点击日期的时候触发了`pick`事件

来到`date-picker/src/panel/date-range.vue`中查找注册的pick事件，在文件内找到了两个组件注册了`pick`事件，那么这两个组件就是对应的`type = daterange`中的左右日期面板

```vue
<template>
  <date-table
      selection-mode="range"
      :date="leftDate"
      :default-value="defaultValue"
      :min-date="minDate"
      :max-date="maxDate"
      :range-state="rangeState"
      :disabled-date="disabledDate"
      :cell-class-name="cellClassName"
      @changerange="handleChangeRange"
      :first-day-of-week="firstDayOfWeek"
      @pick="handleRangePick">
  </date-table>
  <date-table
      selection-mode="range"
      :date="rightDate"
      :default-value="defaultValue"
      :min-date="minDate"
      :max-date="maxDate"
      :range-state="rangeState"
      :disabled-date="disabledDate"
      :cell-class-name="cellClassName"
      @changerange="handleChangeRange"
      :first-day-of-week="firstDayOfWeek"
      @pick="handleRangePick">
  </date-table>
</template>
```

进入所绑定的处理事件内

```javascript
function handleRangePick(val, close = true) {
    const defaultTime = this.defaultTime || [];
    const minDate = modifyWithTimeString(val.minDate, defaultTime[0]);
    const maxDate = modifyWithTimeString(val.maxDate, defaultTime[1]);

    if (this.maxDate === maxDate && this.minDate === minDate) {
        return;
    }
    this.onPick && this.onPick(val);
    this.maxDate = maxDate;
    this.minDate = minDate;

    // workaround for https://github.com/ElemeFE/element/issues/7539, should remove this block when we don't have to care about Chromium 55 - 57
    setTimeout(() => {
        this.maxDate = maxDate;
        this.minDate = minDate;
    }, 10);
    if (!close || this.showTime) return;
    this.handleConfirm();
}
```

进入`this.handleConfirm()`

```javascript
function handleConfirm(visible = false) {
    if (this.isValidValue([this.minDate, this.maxDate])) {
        this.$emit('pick', [this.minDate, this.maxDate], visible);
    }
}
```

可以看到，每一次点击事件时都会执行此方法，当起始日期和终止日期都选择了之后，向上触发`pick`事件

来到它的父级组件`date-picker/src/picker/date-picker.js`内可以看到使用了`mixins`将`date-picker/src/picker.vue`组件混入（原来mixins还能混入组件的），那么核心都在`picker.vue`中

进入`picker.vue`中选择日期的面板是点击输入框后出现的，因此需要关注它的`focus`事件

```javascript
function handleFocus() {
    const type = this.type;

    if (HAVE_TRIGGER_TYPES.indexOf(type) !== -1 && !this.pickerVisible) {
        this.pickerVisible = true;
    }
    this.$emit('focus', this);
}
```

这里需要关注的是`this.pickerVisible = true` 打开日期面板，而组件内也定义了`pickerVisible`的`watch`监听

```javascript
export default {
    watch: {
        pickerVisible(val) {
            if (this.readonly || this.pickerDisabled) return;
            if (val) {
                this.showPicker();
                this.valueOnOpen = Array.isArray(this.value) ? [...this.value] : this.value;
            } else {
                this.hidePicker();
                this.emitChange(this.value);
                this.userInput = null;
                if (this.validateEvent) {
                    this.dispatch('ElFormItem', 'el.form.blur');
                }
                this.$emit('blur', this);
                this.blur();
            }
        }
    }
}
```

根据代码可以看到当`this.pickerVisible = true` 时调用了`this.showPicker()`

```javascript
function showPicker() {
    if (this.$isServer) return;
    if (!this.picker) {
        this.mountPicker();
    }
    this.pickerVisible = this.picker.visible = true;

    this.updatePopper();

    this.picker.value = this.parsedValue;
    this.picker.resetView && this.picker.resetView();

    this.$nextTick(() => {
        this.picker.adjustSpinners && this.picker.adjustSpinners();
    });
}
```

这里只需要关注`this.mountPicker()`

```javascript
function mountPicker() {
    this.picker = new Vue(this.panel).$mount();
    this.picker.defaultValue = this.defaultValue;
    this.picker.defaultTime = this.defaultTime;
    this.picker.popperClass = this.popperClass;
    this.popperElm = this.picker.$el;
    this.picker.width = this.reference.getBoundingClientRect().width;
    this.picker.showTime = this.type === 'datetime' || this.type === 'datetimerange';
    this.picker.selectionMode = this.selectionMode;
    this.picker.unlinkPanels = this.unlinkPanels;
    this.picker.arrowControl = this.arrowControl || this.timeArrowControl || false;
    this.$watch('format', (format) => {
        this.picker.format = format;
    });

    const updateOptions = () => {
        const options = this.pickerOptions;

        if (options && options.selectableRange) {
            let ranges = options.selectableRange;
            const parser = TYPE_VALUE_RESOLVER_MAP.datetimerange.parser;
            const format = DEFAULT_FORMATS.timerange;

            ranges = Array.isArray(ranges) ? ranges : [ranges];
            this.picker.selectableRange = ranges.map(range => parser(range, format, this.rangeSeparator));
        }

        for (const option in options) {
            if (options.hasOwnProperty(option) &&
                // 忽略 time-picker 的该配置项
                option !== 'selectableRange') {
                this.picker[option] = options[option];
            }
        }

        // main format must prevail over undocumented pickerOptions.format
        if (this.format) {
            this.picker.format = this.format;
        }
    };
    updateOptions();
    this.unwatchPickerOptions = this.$watch('pickerOptions', () => updateOptions(), { deep: true });
    this.$el.appendChild(this.picker.$el);
    this.picker.resetView && this.picker.resetView();

    this.picker.$on('dodestroy', this.doDestroy);
    this.picker.$on('pick', (date = '', visible = false) => {
        this.userInput = null;
        this.pickerVisible = this.picker.visible = visible;
        this.emitInput(date);
        this.picker.resetView && this.picker.resetView();
    });

    this.picker.$on('select-range', (start, end, pos) => {
        if (this.refInput.length === 0) return;
        if (!pos || pos === 'min') {
            this.refInput[0].setSelectionRange(start, end);
            this.refInput[0].focus();
        } else if (pos === 'max') {
            this.refInput[1].setSelectionRange(start, end);
            this.refInput[1].focus();
        }
    });
}
```

`mountPicker()`内渲染了日期选择的面板并保存到了`this.picker`内，从代码中可以看到处理了由`data-range`组件传递出来的`pick`事件，处理事件内部将日期选择面板关闭后调用`this.emitInput(date)`和一些其他不重要的操作

```javascript
function emitInput(val) {
    const formatted = this.formatToValue(val);
    if (!valueEquals(this.value, formatted)) {
        this.$emit('input', formatted);
    }
}
```

可以看到`date-picker`触发的`input`事件就是从这里出来的，而`change`事件则在`pickerVisible`的`watch`监听内的代码段`else`分支内触发（上面提到了`pick`事件会关闭面板）

```javascript
function emitChange(val) {
    // determine user real change only
    if (!valueEquals(val, this.valueOnOpen)) {
        this.$emit('change', val);
        this.valueOnOpen = val;
        if (this.validateEvent) {
            this.dispatch('ElFormItem', 'el.form.change', val);
        }
    }
}
```

所以需要在`input`事件内对绑定的`value`进行赋值，`value`有值且不相等才会触发`change`事件

## 为什么v-model是正常的

::: tip 来自Vue文档 - 自定义v-model
一个组件上的 v-model 默认会利用名为 value 的 prop 和名为 input 的事件，但是像单选框、复选框等类型的输入控件可能会将 value attribute 用于不同的目的。model 选项可以用来避免这样的冲突：
:::

::: warning 来自Vue文档 - 自定义v-model
注意你仍然需要在组件的 props 选项里声明 checked 这个 prop。
:::

可以看到`picker.vue`的`props`内的确存在了一个名为`value`的属性，而选择好日期后也触发了`input`事件，这样就完成了自定义`v-model`，当关闭了面板时按照`pickerVisible`的`watch`监听逻辑，满足了`change`事件触发条件，因此`change`事件会被正常触发

## end

所以大概是文档没写清楚两种使用方法应该注册不同的事件，并不是bug

- 使用`v-model`时注册`change`事件
- 使用`value`绑定时注册`input`事件（也可以额外注册`change`事件，但是必须通过`input`事件赋值）
