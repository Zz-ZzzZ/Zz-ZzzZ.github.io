# 在 Angular / FormGroup 内使用数组作为属性值出现的问题

在日常使用`FormBuilder`创建的`FormGroup`时一般有两种使用方式。

1. 每个属性嵌套`FormControl`
```typescript
formGroup = this.fb.group({
    name: this.fb.control(''),
    date: this.fb.control([])
})
```
2. 不嵌套`FormControl`，直接定义值
```typescript
formGroup = this.fb.group({
    name: '',
    date: []
})
```

在使用第一种方式时不会出现任何异常，使用第二种方式时若`date`的类型为基本类型也不会出现什么问题，
我们知道第二种方式实际和第一种一样，在初始化时`Angular`会将其包裹上`FormControl`。
而这里定义的为数组类型，此时如果这样定义，在使用时则会报与数组有关的错误。

比如：`TypeError: date is not iterable`。

在控制台打印其值得到的是`null`，令人不解，所以需要去源码内探究一番。

```typescript
// packages/forms/form_builders.ts  Angular Version 19.0.0-next.0
export class FormBuilder {
    // ...
    group(
        controls: {[key: string]: any},
        options: AbstractControlOptions | {[key: string]: any} | null = null,
    ): FormGroup {
        const reducedControls = this._reduceControls(controls);
        let newOptions: FormControlOptions = {};
        if (isAbstractControlOptions(options)) {
            // `options` are `AbstractControlOptions`
            newOptions = options;
        } else if (options !== null) {
            // `options` are legacy form group options
            newOptions.validators = (options as any).validator;
            newOptions.asyncValidators = (options as any).asyncValidator;
        }
        return new FormGroup(reducedControls, newOptions);
    }

    _reduceControls<T>(controls: {
        [k: string]: T | ControlConfig<T> | FormControlState<T> | AbstractControl<T>;
    }): {[key: string]: AbstractControl} {
        const createdControls: {[key: string]: AbstractControl} = {};
        Object.keys(controls).forEach((controlName) => {
            createdControls[controlName] = this._createControl(controls[controlName]);
        });
        return createdControls;
    }

    _createControl<T>(
        controls: T | FormControlState<T> | ControlConfig<T> | FormControl<T> | AbstractControl<T>,
    ): FormControl<T> | FormControl<T | null> | AbstractControl<T> {
        if (controls instanceof FormControl) {
            return controls as FormControl<T>;
        } else if (controls instanceof AbstractControl) {
            // A control; just return it
            return controls;
        } else if (Array.isArray(controls)) {
            // ControlConfig Tuple
            const value: T | FormControlState<T> = controls[0];
            const validator: ValidatorFn | ValidatorFn[] | null =
                controls.length > 1 ? controls[1]! : null;
            const asyncValidator: AsyncValidatorFn | AsyncValidatorFn[] | null =
                controls.length > 2 ? controls[2]! : null;
            return this.control<T>(value, validator, asyncValidator);
        } else {
            // T or FormControlState<T>
            return this.control<T>(controls);
        }
    }

    control<T>(
        formState: T | FormControlState<T>,
        validatorOrOpts?: ValidatorFn | ValidatorFn[] | FormControlOptions | null,
        asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
    ): FormControl {
        let newOptions: FormControlOptions = {};
        if (!this.useNonNullable) {
            return new FormControl(formState, validatorOrOpts, asyncValidator);
        }
        if (isAbstractControlOptions(validatorOrOpts)) {
            // If the second argument is options, then they are copied.
            newOptions = validatorOrOpts;
        } else {
            // If the other arguments are validators, they are copied into an options object.
            newOptions.validators = validatorOrOpts;
            newOptions.asyncValidators = asyncValidator;
        }
        return new FormControl<T>(formState, {...newOptions, nonNullable: true});
    }
    // ...
}
```

在`FormBuilder`内部为每一个属性的属性值都做了不同的类型判断，
定义的`date`为数组类型，那么就进入了`Array.isArray(controls)`代码块中。

可以发现，是取内部的索引**下标为0**作为属性值，而此时定义的数组内第0个元素为`undefined`。


那么就算取到的值为`undefined`为什么控制台得到的是`null`，进入`new FormControl`内。

```typescript
export class FormControl {
    constructor(
        // formState and defaultValue will only be null if T is nullable
        formState: FormControlState<TValue> | TValue = null as unknown as TValue,
        validatorOrOpts?: ValidatorFn | ValidatorFn[] | FormControlOptions | null,
        asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
    ) {
        // ...
    }

    private _applyFormState(formState: FormControlState<TValue> | TValue) {
        if (isFormControlState(formState)) {
            (this as Writable<this>).value = this._pendingValue = formState.value;
            formState.disabled
                ? this.disable({onlySelf: true, emitEvent: false})
                : this.enable({onlySelf: true, emitEvent: false});
        } else {
            (this as Writable<this>).value = this._pendingValue = formState;
        }
    }
}
```

在`FormControl`内的构造函数内能够看见，`formState`的默认值是`null`，而这时传入的`undefined`相当于未传入该值，所以取`null`。

因此如果想正确的使用时，应该定义一个二维数组，定义第0个下标为数组。

```typescript
formGroup = this.fb.group({
    name: '',
    date: [[]]
})
```

